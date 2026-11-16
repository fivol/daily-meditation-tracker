import { InputFile, type Api } from 'grammy';
import { FieldValue } from 'firebase-admin/firestore';
import { env } from '../config.js';
import { checkins, days, db, members, polls, users } from '../db.js';
import {
  milestoneText,
  pollQuestion,
  POLL_OPTIONS,
  renderLeaderboard,
  renderReminder,
  renderRemoval,
  renderRemovalDm,
  renderWeekly,
} from '../render.js';
import { applyDay, emptyStats, reachedMilestones } from '../stats.js';
import { addDays, isMonday } from '../time.js';
import type { ChatSettings, DayStatus, Member, Slot } from '../types.js';
import { updateChat } from './chats.js';
import { checkinsOfDay, checkinsOfMember, doneSessions, sessionKey } from './checkins.js';
import { getMember, listMembers, updateMember } from './members.js';
import { updateProgress } from './progress.js';

const silentHtml = { parse_mode: 'HTML', disable_notification: true } as const;

/** Leaderboard for a closed day (optionally with the weekly recap on top). */
export async function buildLeaderboard(
  chatId: number,
  settings: ChatSettings,
  date: string,
  withWeekly = false,
): Promise<string> {
  const [all, daySnap] = await Promise.all([listMembers(chatId), days(chatId).doc(date).get()]);
  const group = { done: 0, possible: 0 };
  for (const m of all) {
    const entry = m.recent.at(-1);
    if (entry?.date !== date) continue;
    group.done += entry.sessions;
    if (entry.status === 'active') group.possible += 2;
  }
  return renderLeaderboard({
    date,
    members: all,
    newcomerDays: settings.newcomerDays,
    group,
    milestones: daySnap.data()?.milestones ?? [],
    weekly: withWeekly ? renderWeekly(all) : undefined,
  });
}

async function sendPoll(api: Api, chatId: number, date: string, slot: Slot, notify: boolean) {
  const message = await api.sendPoll(
    chatId,
    pollQuestion(slot, date),
    POLL_OPTIONS.map((o) => ({ text: o.text })),
    { is_anonymous: false, disable_notification: !notify },
  );
  await polls().doc(message.poll.id).set({
    chatId,
    date,
    slot,
    optionMinutes: POLL_OPTIONS.map((o) => o.minutes),
  });
  await days(chatId)
    .doc(date)
    .set({ polls: { [slot]: { messageId: message.message_id, pollId: message.poll.id } } }, { merge: true });
}

/** 05:00 — yesterday's leaderboard (+ weekly recap on Mondays) and the morning poll. */
export async function runMorning(api: Api, chatId: number, settings: ChatSettings, date: string) {
  const yesterday = addDays(date, -1);
  const monday = isMonday(date);
  if (yesterday >= settings.startDate) {
    const text = await buildLeaderboard(chatId, settings, yesterday, monday);
    await api.sendMessage(chatId, text, silentHtml);
  }
  await sendPoll(api, chatId, date, 'morning', false);
  await updateProgress(api, chatId);
  if (monday && env.ownerId) {
    await sendExport(api, chatId, env.ownerId).catch((err) => console.error('Weekly export failed', err));
  }
}

/** 16:00 — the evening poll. */
export async function runEvening(api: Api, chatId: number, _settings: ChatSettings, date: string) {
  await sendPoll(api, chatId, date, 'evening', true);
}

/** 21:30 — ping active members with no session today. */
export async function runReminder(api: Api, chatId: number, settings: ChatSettings, date: string) {
  const [all, list] = await Promise.all([listMembers(chatId), checkinsOfDay(chatId, date)]);
  const practiced = new Set(list.filter((c) => c.status === 'done').map((c) => c.userId));
  const targets = all.filter((m) => m.status === 'active' && m.joinedDate <= date && !practiced.has(m.userId));
  if (targets.length === 0) return;
  await api.sendMessage(chatId, renderReminder(targets, settings.missLimit), { parse_mode: 'HTML' });
}

/** How a member takes part in a day before their check-ins are considered. */
function baseStatus(m: Member, date: string): DayStatus {
  if (m.status === 'removed') return 'absent';
  if (m.status === 'paused' && (!m.pauseUntil || m.pauseUntil >= date)) return 'paused';
  return 'active';
}

/** 04:00 — finalize a day: stop polls, update aggregates, apply the removal rule. */
export async function closeDay(api: Api, chatId: number, settings: ChatSettings, date: string) {
  const dayRef = days(chatId).doc(date);
  const day = (await dayRef.get()).data();
  for (const poll of Object.values(day?.polls ?? {})) {
    await api.stopPoll(chatId, poll.messageId).catch(() => undefined); // already stopped or deleted
  }

  const [all, list] = await Promise.all([listMembers(chatId), checkinsOfDay(chatId, date)]);
  const sessions = doneSessions(list);
  const statuses: Record<string, DayStatus> = {};
  const milestones: string[] = [];
  const toRemove: Member[] = [];
  const batch = db.batch();

  for (const m of all) {
    if (m.joinedDate > date) continue;
    const base = baseStatus(m, date);
    statuses[m.userId] = base;
    const after = applyDay(m, date, base, sessions.get(sessionKey(date, m.userId)) ?? {});
    milestones.push(...reachedMilestones(m, after).map((ms) => milestoneText(m, ms)));

    const patch: Record<string, unknown> = { ...after };
    if (m.status === 'paused' && m.pauseUntil && m.pauseUntil <= date) {
      Object.assign(patch, { status: 'active', pauseUntil: FieldValue.delete(), pauseReason: FieldValue.delete() });
    }
    if (m.status === 'active' && after.missedInRow >= settings.missLimit) toRemove.push(m);
    batch.set(members(chatId).doc(String(m.userId)), patch, { merge: true });
  }
  batch.set(dayRef, { statuses, milestones }, { merge: true });
  await batch.commit();
  await updateChat(chatId, { lastClosedDate: date });

  for (const m of toRemove) {
    await removeMember(api, chatId, m).catch((err) => console.error(`Removal of ${m.userId} failed`, err));
  }
}

async function removeMember(api: Api, chatId: number, m: Member) {
  const current = await api.getChatMember(chatId, m.userId);
  if (current.status === 'creator' || current.status === 'administrator') return; // warning-only for admins
  if (current.status !== 'left' && current.status !== 'kicked') {
    await api.banChatMember(chatId, m.userId);
    await api.unbanChatMember(chatId, m.userId, { only_if_banned: true });
  }
  await updateMember(chatId, m.userId, { status: 'removed' });
  await api.sendMessage(chatId, renderRemoval(m), silentHtml);

  if (!(await users().doc(String(m.userId)).get()).data()?.canDm) return;
  const [link, chat] = await Promise.all([
    api.createChatInviteLink(chatId, { member_limit: 1, name: `Return ${m.userId}` }),
    api.getChat(chatId),
  ]);
  const title = 'title' in chat && chat.title ? chat.title : 'практика';
  await api.sendMessage(m.userId, renderRemovalDm(title, link.invite_link), { parse_mode: 'HTML' });
}

/** Rebuilds a member's aggregates from day snapshots and check-ins (after an admin fix). */
export async function recomputeMember(chatId: number, userId: number): Promise<void> {
  const daySnaps = await days(chatId).get();
  const closed = daySnaps.docs
    .map((doc) => ({ date: doc.id, status: doc.data().statuses?.[userId] }))
    .filter((d): d is { date: string; status: DayStatus } => d.status !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sessions = doneSessions(await checkinsOfMember(chatId, userId, closed.map((d) => d.date)));
  const stats = closed.reduce(
    (acc, d) => applyDay(acc, d.date, d.status, sessions.get(sessionKey(d.date, userId)) ?? {}),
    emptyStats(),
  );
  if (await getMember(chatId, userId)) await updateMember(chatId, userId, stats);
}

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

/** Sends all check-ins of the chat as CSV to a user's private chat. */
export async function sendExport(api: Api, chatId: number, toUserId: number): Promise<void> {
  const [snap, all] = await Promise.all([checkins(chatId).get(), listMembers(chatId)]);
  const byId = new Map(all.map((m) => [m.userId, m]));
  const rows = snap.docs
    .map((doc) => doc.data())
    .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot))
    .map((c) => {
      const m = byId.get(c.userId);
      return [c.date, c.slot, c.userId, m?.firstName, m?.username, c.status, c.minutes, c.firstAt, c.updatedAt, c.source]
        .map(csvCell)
        .join(',');
    });
  const header = 'date,slot,user_id,name,username,status,minutes,first_at,updated_at,source';
  const csv = [header, ...rows].join('\n');
  const stamp = new Date().toISOString().slice(0, 10);
  await api.sendDocument(toUserId, new InputFile(Buffer.from(csv), `checkins-${chatId}-${stamp}.csv`));
}

import { InputFile, type Api } from 'grammy';
import { FieldValue } from 'firebase-admin/firestore';
import { env } from '../config.js';
import { chats, checkins, days, db, mergeMap, members, polls, users } from '../db.js';
import { log } from '../logger.js';
import {
  awardLines,
  groupAwardLine,
  pollQuestion,
  POLL_OPTIONS,
  renderLeaderboard,
  renderReminder,
  renderRemoval,
  renderRemovalDm,
  renderSummary,
} from '../render.js';
import { groupDashboard } from '../charts/group.js';
import { toPng } from '../charts/png.js';
import { periodsEndingOn, summarize, type Period } from '../summary.js';
import { earnedAwards, earnedGroupAwards, maxTitle, nextNoLossRun } from '../awards.js';
import { applyDay, baseStatusOf, emptyStats } from '../stats.js';
import { addDays, isMonday } from '../time.js';
import type { AwardRecord, ChatSettings, DayStatus, Member, Slot } from '../types.js';
import { getChat } from './chats.js';
import { checkinsOfDay, checkinsOfMember, doneSessions, sessionKey } from './checkins.js';
import { loadHistory } from './history.js';
import { getMember, listMembers, updateMember } from './members.js';
import { updateProgress } from './progress.js';

const silentHtml = { parse_mode: 'HTML', disable_notification: true } as const;

/** Leaderboard for a closed day. */
export async function buildLeaderboard(chatId: number, settings: ChatSettings, date: string): Promise<string> {
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
    group,
    awardLines: daySnap.data()?.awardLines ?? [],
    missLimit: settings.missLimit,
  });
}

async function sendPoll(api: Api, chatId: number, date: string, slot: Slot, notify: boolean) {
  const message = await api.sendPoll(
    chatId,
    pollQuestion(slot, date),
    POLL_OPTIONS.map((o) => ({ text: o.text })),
    { is_anonymous: false, disable_notification: !notify },
  );
  // The mapping and the job marker are written together, so a failure here can't leave a poll
  // whose votes are ignored, and a retry can't post a second poll.
  const batch = db.batch();
  batch.set(polls().doc(message.poll.id), { chatId, date, slot, optionMinutes: POLL_OPTIONS.map((o) => o.minutes) });
  batch.set(
    days(chatId).doc(date),
    { polls: { [slot]: { messageId: message.message_id, pollId: message.poll.id } }, jobsDone: { [slot]: true } },
    { merge: true },
  );
  await batch.commit();
  // Pinned so the poll doesn't get lost in the chat; unpinned when the day closes.
  await api
    .pinChatMessage(chatId, message.message_id, { disable_notification: true })
    .catch((err) => log.error(`Chat ${chatId}: pinning the ${slot} poll failed`, err));
}

/** Start of the day (04:00, right after the close) — yesterday's leaderboard. */
export async function runLeaderboard(api: Api, chatId: number, settings: ChatSettings, date: string) {
  const yesterday = addDays(date, -1);
  if (yesterday >= settings.startDate) {
    await api.sendMessage(chatId, await buildLeaderboard(chatId, settings, yesterday), silentHtml);
  }
  if (isMonday(date) && env.ownerId) {
    await sendExport(api, chatId, env.ownerId).catch((err) => log.error('Weekly export failed', err));
  }
}

/**
 * Sends the summary of a period to `target` (the group itself, or an admin's private chat):
 * the text first, then the dashboard picture as a separate message. A failed picture is only
 * logged, so a retry can't post the text twice.
 */
export async function sendSummary(api: Api, chatId: number, settings: ChatSettings, period: Period, target = chatId) {
  const summary = summarize(period, await loadHistory(chatId, period), settings);
  if (summary.totals.possible === 0) return;
  await api.sendMessage(target, renderSummary(summary), silentHtml);
  try {
    const chat = await api.getChat(chatId);
    const title = 'title' in chat && chat.title ? chat.title : 'Наша практика';
    const png = toPng(groupDashboard(summary, title));
    await api.sendPhoto(target, new InputFile(png, `${period.kind}-${period.to}.png`), { disable_notification: true });
  } catch (err) {
    log.error(`Chat ${chatId}: the ${period.kind} dashboard failed`, err);
  }
}

/**
 * Right after the leaderboard — summaries of the periods that ended yesterday: the week on
 * Sunday's close, the month and the year on the anniversaries of the chat's first day.
 * Never throws: a broken summary must not hold back the morning poll.
 */
export async function runSummaries(api: Api, chatId: number, settings: ChatSettings, date: string) {
  for (const period of periodsEndingOn(settings.startDate, addDays(date, -1))) {
    await sendSummary(api, chatId, settings, period).catch((err) =>
      log.error(`Chat ${chatId}: the ${period.kind} summary failed`, err),
    );
  }
}

/** Right after the leaderboard — the morning poll. */
export async function runMorning(api: Api, chatId: number, _settings: ChatSettings, date: string) {
  await sendPoll(api, chatId, date, 'morning', false);
  // A broken pinned message must not fail the job.
  await updateProgress(api, chatId).catch((err) => log.error(`Chat ${chatId}: progress update failed`, err));
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

/**
 * Final awards of a member after a closed day: pending awards become permanent, awards the day
 * qualifies for but that weren't granted yet (e.g. "Кремень") are added silently. Returns Firestore
 * field updates, the resulting map and the ids dated with this day.
 */
function closeAwards(m: Member, earned: Set<string>, date: string) {
  const awards: Record<string, AwardRecord> = {};
  const updates: Record<string, unknown> = {};
  const dropped: AwardRecord[] = [];
  for (const [id, a] of Object.entries(m.awards ?? {})) {
    if (!a.pending || a.date > date) {
      awards[id] = a;
    } else if (earned.has(id)) {
      awards[id] = { ...a, pending: false };
      updates[id] = { pending: false };
    } else {
      dropped.push(a);
      updates[id] = FieldValue.delete();
    }
  }
  for (const id of earned) {
    if (awards[id] || id in updates) continue;
    awards[id] = { date };
    updates[id] = { date };
  }
  const ofDay = Object.entries(awards).filter(([, a]) => a.date === date).map(([id]) => id);
  return { awards, updates, dropped, ofDay };
}

/** 04:00 — finalize a day: stop polls, update aggregates and awards, apply the removal rule. */
export async function closeDay(api: Api, chatId: number, settings: ChatSettings, date: string) {
  const dayRef = days(chatId).doc(date);
  const day = (await dayRef.get()).data();
  for (const poll of Object.values(day?.polls ?? {})) {
    await api.stopPoll(chatId, poll.messageId).catch(() => undefined); // already stopped or deleted
    await api.unpinChatMessage(chatId, poll.messageId).catch(() => undefined);
  }

  const [all, list] = await Promise.all([listMembers(chatId), checkinsOfDay(chatId, date)]);
  const sessions = doneSessions(list);
  const statuses: Record<string, DayStatus> = {};
  const lines: string[] = [];
  const toRemove: Member[] = [];
  const dropped: AwardRecord[] = [];
  const activeSessions: number[] = [];
  let totalMinutes = 0;
  const batch = db.batch();

  for (const m of all) {
    if (m.joinedDate > date) continue;
    const base = baseStatusOf(m, date);
    statuses[m.userId] = base;
    const after = applyDay(m, date, base, sessions.get(sessionKey(date, m.userId)) ?? {}, settings);
    const entry = after.recent.at(-1)!;
    if (entry.status === 'active') activeSessions.push(entry.sessions);
    totalMinutes += after.minutes;

    const earned = earnedAwards({ ...after, date, removedOn: m.removedOn }, true);
    const final = closeAwards(m, earned, date);
    dropped.push(...final.dropped);
    lines.push(...awardLines(m, final.ofDay));

    const patch: Record<string, unknown> = {
      ...after,
      awards: mergeMap(final.updates),
      title: maxTitle(final.awards) || FieldValue.delete(),
    };
    if (m.status === 'paused' && m.pauseUntil && m.pauseUntil <= date) {
      Object.assign(patch, { status: 'active', pauseUntil: FieldValue.delete(), pauseReason: FieldValue.delete() });
    }
    if (m.status === 'active' && after.missedInRow >= settings.missLimit) toRemove.push(m);
    batch.set(db.doc(members(chatId).doc(String(m.userId)).path), patch, { merge: true });
  }

  const noLossRun = nextNoLossRun(settings.noLossRun ?? 0, activeSessions);
  const groupNew = earnedGroupAwards({ activeSessions, noLossRun, totalMinutes }).filter((id) => !settings.awards?.[id]);
  lines.push(...groupNew.map(groupAwardLine));

  batch.set(dayRef, { statuses, awardLines: lines }, { merge: true });
  // Same batch: the day is applied to the stats exactly once, even if the bot dies right here.
  batch.set(
    chats().doc(String(chatId)),
    { lastClosedDate: date, noLossRun, awards: mergeMap(Object.fromEntries(groupNew.map((id) => [id, date]))) },
    { merge: true },
  );
  await batch.commit();
  if (groupNew.length) log.info(`Chat ${chatId}: group earned ${groupNew.join(', ')}`);

  // Pending awards the final day no longer supports: their congratulations go too.
  for (const a of dropped) {
    if (a.messageId) await api.deleteMessage(chatId, a.messageId).catch(() => undefined);
  }
  for (const m of toRemove) {
    await removeMember(api, chatId, m, date).catch((err) =>
      log.error(`Chat ${chatId}: removal of ${m.userId} failed`, err),
    );
  }
}

async function removeMember(api: Api, chatId: number, m: Member, date: string) {
  const current = await api.getChatMember(chatId, m.userId);
  if (current.status === 'creator' || current.status === 'administrator') {
    log.info(`Chat ${chatId}: ${m.userId} missed ${m.missedInRow + 1} days but is an admin, not removed`);
    return;
  }
  if (current.status !== 'left' && current.status !== 'kicked') {
    await api.banChatMember(chatId, m.userId);
    // Unbanning exists only in supergroups; in basic groups a ban is already a plain kick.
    await api.unbanChatMember(chatId, m.userId, { only_if_banned: true }).catch(() => undefined);
  }
  await updateMember(chatId, m.userId, { status: 'removed', removedOn: date });
  log.info(`Chat ${chatId}: removed ${m.userId} (${m.firstName}) after ${m.missedInRow + 1} missed days`);
  await api.sendMessage(chatId, renderRemoval(m), silentHtml);

  if (!(await users().doc(String(m.userId)).get()).data()?.canDm) return;
  const [link, chat] = await Promise.all([
    api.createChatInviteLink(chatId, { member_limit: 1, name: `Return ${m.userId}` }),
    api.getChat(chatId),
  ]);
  const title = 'title' in chat && chat.title ? chat.title : 'практика';
  await api.sendMessage(m.userId, renderRemovalDm(title, link.invite_link), { parse_mode: 'HTML' });
}

/** Closed days with their snapshots, oldest first. */
async function closedDays(chatId: number) {
  const snap = await days(chatId).get();
  return snap.docs
    .map((doc) => ({ date: doc.id, statuses: doc.data().statuses }))
    .filter((d): d is { date: string; statuses: Record<string, DayStatus> } => d.statuses !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Rebuilds a member's aggregates from day snapshots and check-ins (after an admin fix or for a
 * migration) and grants, silently and dated when first met, any titles and achievements the
 * history qualifies for. Granted awards are never taken away here.
 */
export async function recomputeMember(chatId: number, userId: number): Promise<void> {
  const [settings, member, history] = await Promise.all([getChat(chatId), getMember(chatId, userId), closedDays(chatId)]);
  if (!settings || !member) return;
  const closed = history.filter((d) => d.statuses[userId] !== undefined);
  const sessions = doneSessions(await checkinsOfMember(chatId, userId, closed.map((d) => d.date)));

  let stats = emptyStats();
  const firstMet: Record<string, string> = {};
  for (const d of closed) {
    stats = applyDay(stats, d.date, d.statuses[userId], sessions.get(sessionKey(d.date, userId)) ?? {}, settings);
    for (const id of earnedAwards({ ...stats, date: d.date, removedOn: member.removedOn }, true)) firstMet[id] ??= d.date;
  }

  const awards: Record<string, AwardRecord> = { ...member.awards };
  const added = Object.entries(firstMet).filter(([id]) => !awards[id]);
  for (const [id, date] of added) awards[id] = { date };
  await db.doc(members(chatId).doc(String(userId)).path).set(
    {
      ...stats,
      awards: mergeMap(Object.fromEntries(added.map(([id, date]) => [id, { date }]))),
      title: maxTitle(awards) || FieldValue.delete(),
    },
    { merge: true },
  );
}

/** Grants the group achievements the closed history qualifies for, silently, dated when first met. */
export async function recomputeGroupAwards(chatId: number): Promise<void> {
  const settings = await getChat(chatId);
  if (!settings) return;
  let noLossRun = 0;
  let totalMinutes = 0;
  const firstMet: Record<string, string> = {};
  for (const d of await closedDays(chatId)) {
    const list = (await checkinsOfDay(chatId, d.date)).filter((c) => c.status === 'done' && c.minutes);
    const perUser = new Map<string, number>();
    for (const c of list) {
      perUser.set(String(c.userId), (perUser.get(String(c.userId)) ?? 0) + 1);
      totalMinutes += c.minutes!;
    }
    // Active that day: not paused or absent, or practiced anyway.
    const activeSessions = Object.entries(d.statuses)
      .filter(([userId, status]) => status === 'active' || perUser.has(userId))
      .map(([userId]) => perUser.get(userId) ?? 0);
    noLossRun = nextNoLossRun(noLossRun, activeSessions);
    for (const id of earnedGroupAwards({ activeSessions, noLossRun, totalMinutes })) firstMet[id] ??= d.date;
  }
  const added = Object.entries(firstMet).filter(([id]) => !settings.awards?.[id]);
  await chats().doc(String(chatId)).set({ noLossRun, awards: mergeMap(Object.fromEntries(added)) }, { merge: true });
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

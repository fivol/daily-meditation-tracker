import { FieldValue } from 'firebase-admin/firestore';
import type { Api } from 'grammy';
import { achievementById, earnedAwards, maxTitle } from '../awards.js';
import { checkinId, checkins, db, members } from '../db.js';
import { log } from '../logger.js';
import { renderAwards } from '../render.js';
import { withStatsDefaults, withToday } from '../stats.js';
import { practiceDate } from '../time.js';
import { SLOTS, type AwardRecord, type ChatSettings, type Checkin, type Member } from '../types.js';
import { doneSessions, sessionKey } from './checkins.js';

const silentHtml = { parse_mode: 'HTML', disable_notification: true } as const;

/**
 * Re-evaluates a member's titles and achievements after a vote (or an admin fix of today).
 * New awards are granted as pending and congratulated in one message; pending awards whose
 * condition no longer holds are taken back, and their congratulation is edited or deleted.
 * `silent` (retroactive launch) grants what is met as final, without messages or revocations.
 */
export async function evaluateAwards(
  api: Api,
  chatId: number,
  settings: ChatSettings,
  userId: number,
  { replyTo, silent = false }: { replyTo?: number; silent?: boolean } = {},
): Promise<void> {
  const today = practiceDate(settings);
  const memberDoc = db.doc(members(chatId).doc(String(userId)).path);
  const checkinRefs = SLOTS.map((slot) => checkins(chatId).doc(checkinId(today, userId, slot)));

  // In a transaction: handling the same vote twice can't grant or congratulate twice.
  const result = await db.runTransaction(async (tx) => {
    const [memberSnap, ...checkinSnaps] = await tx.getAll(memberDoc, ...checkinRefs);
    if (!memberSnap.exists) return null;
    const member = withStatsDefaults(memberSnap.data() as Member);
    const list = checkinSnaps.filter((s) => s.exists).map((s) => s.data() as Checkin);
    const done = doneSessions(list).get(sessionKey(today, userId)) ?? {};
    const live = withToday(member, today, done, settings);
    const earned = earnedAwards({ ...live, date: today, removedOn: member.removedOn }, false);

    const awards: Record<string, AwardRecord> = { ...member.awards };
    const added = [...earned].filter((id) => !awards[id]);
    const revoked = Object.entries(awards)
      .filter(([id, a]) => !silent && a.pending && a.date === today && !earned.has(id) && !achievementById(id)?.atClose)
      .map(([id, a]) => ({ id, ...a }));
    if (added.length === 0 && revoked.length === 0) return null;

    for (const id of added) awards[id] = silent ? { date: today } : { date: today, pending: true };
    for (const { id } of revoked) delete awards[id];
    const title = maxTitle(awards);
    tx.set(
      memberDoc,
      {
        awards: Object.fromEntries([
          ...added.map((id) => [id, awards[id]]),
          ...revoked.map(({ id }) => [id, FieldValue.delete()]),
        ]),
        title: title || FieldValue.delete(),
      },
      { merge: true },
    );
    return { member, added, revoked, awards };
  });
  if (!result) return;
  const { member, added, revoked, awards } = result;

  if (revoked.length) log.info(`Chat ${chatId}: ${userId} lost pending ${revoked.map((r) => r.id).join(', ')}`);
  const touched = new Set(revoked.map((r) => r.messageId).filter((id): id is number => id !== undefined));
  for (const messageId of touched) {
    const remaining = Object.entries(awards).filter(([, a]) => a.messageId === messageId).map(([id]) => id);
    const update = remaining.length
      ? api.editMessageText(chatId, messageId, renderAwards(member, remaining), { parse_mode: 'HTML' })
      : api.deleteMessage(chatId, messageId);
    await update.catch((err) => log.error(`Chat ${chatId}: updating congratulation ${messageId} failed`, err));
  }

  if (added.length === 0) return;
  log.info(`Chat ${chatId}: ${userId} earned ${added.join(', ')}${silent ? ' (silently)' : ''}`);
  if (silent) return;
  try {
    const message = await api.sendMessage(chatId, renderAwards(member, added), {
      ...silentHtml,
      ...(replyTo && { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } }),
    });
    // Only awards that weren't taken back meanwhile get the message id.
    await db.runTransaction(async (tx) => {
      const current = ((await tx.get(memberDoc)).data()?.awards ?? {}) as Record<string, AwardRecord>;
      const still = added.filter((id) => current[id]);
      if (still.length) {
        tx.set(memberDoc, { awards: Object.fromEntries(still.map((id) => [id, { messageId: message.message_id }])) }, { merge: true });
      }
    });
  } catch (err) {
    // The awards stay granted and visible in /me even without the message.
    log.error(`Chat ${chatId}: congratulating ${userId} failed`, err);
  }
}

import { checkinId, checkins, db } from '../db.js';
import type { DaySessions } from '../stats.js';
import type { Checkin, CheckinStatus, Minutes, Slot } from '../types.js';

/**
 * Creates or overwrites a member's check-in for a slot.
 * `minutes: null` with status `skipped` = "didn't practice"; status `revoked` = vote retracted.
 */
export async function saveCheckin(
  chatId: number,
  entry: { userId: number; date: string; slot: Slot; status: CheckinStatus; minutes: Minutes | null },
  source: Checkin['source'],
): Promise<void> {
  const ref = checkins(chatId).doc(checkinId(entry.date, entry.userId, entry.slot));
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).data();
    tx.set(ref, { ...entry, source, firstAt: existing?.firstAt ?? now, updatedAt: now });
  });
}

export async function checkinsOfDay(chatId: number, date: string): Promise<Checkin[]> {
  const snap = await checkins(chatId).where('date', '==', date).get();
  return snap.docs.map((doc) => doc.data());
}

/** Check-ins of one member for the given dates, fetched by id (no composite index needed). */
export async function checkinsOfMember(chatId: number, userId: number, dates: string[]): Promise<Checkin[]> {
  const refs = dates.flatMap((date) =>
    (['morning', 'evening'] as const).map((slot) => checkins(chatId).doc(checkinId(date, userId, slot))),
  );
  const result: Checkin[] = [];
  for (let i = 0; i < refs.length; i += 100) {
    const snaps = await db.getAll(...refs.slice(i, i + 100));
    for (const snap of snaps) if (snap.exists) result.push(snap.data() as Checkin);
  }
  return result;
}

/** Done sessions keyed by `sessionKey(date, userId)`. */
export function doneSessions(list: Checkin[]): Map<string, DaySessions> {
  const result = new Map<string, DaySessions>();
  for (const c of list) {
    if (c.status !== 'done' || !c.minutes) continue;
    const key = sessionKey(c.date, c.userId);
    result.set(key, { ...result.get(key), [c.slot]: c.minutes });
  }
  return result;
}

export const sessionKey = (date: string, userId: number) => `${date}:${userId}`;

import { checkins, days, db } from '../db.js';
import type { HistoryData, Period } from '../summary.js';
import { dateRange } from '../time.js';
import type { Checkin, DayDoc, DayStatus } from '../types.js';
import { listMembers } from './members.js';

/** Everything a group summary needs: members, day-close snapshots and check-ins of the period and the one before it. */
export async function loadHistory(chatId: number, period: Period): Promise<HistoryData> {
  const from = period.prev?.from ?? period.from;
  const refs = dateRange(from, period.to).map((date) => days(chatId).doc(date));
  const statuses = new Map<string, Record<string, DayStatus>>();
  for (let i = 0; i < refs.length; i += 100) {
    for (const snap of await db.getAll(...refs.slice(i, i + 100))) {
      const snapshot = (snap.data() as DayDoc | undefined)?.statuses;
      if (snapshot) statuses.set(snap.id, snapshot);
    }
  }
  const [members, list] = await Promise.all([
    listMembers(chatId),
    checkins(chatId).where('date', '>=', from).where('date', '<=', period.to).get(),
  ]);
  return { members, statuses, checkins: list.docs.map((doc) => doc.data()).filter((c) => c.status === 'done') };
}

/** Every check-in a member ever made in the chat. */
export async function loadPersonalCheckins(chatId: number, userId: number): Promise<Checkin[]> {
  const snap = await checkins(chatId).where('userId', '==', userId).get();
  return snap.docs.map((doc) => doc.data());
}

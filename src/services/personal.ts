import { rankMembers, withToday, type DaySessions } from '../stats.js';
import { addDays, dateRange, practiceDate, usualTime } from '../time.js';
import type { ChatSettings, Member, Minutes, Slot } from '../types.js';
import { checkinsOfMember, doneSessions, sessionKey } from './checkins.js';
import { listMembers } from './members.js';

export interface PersonalStats {
  /** Aggregates with today's sessions already counted. */
  member: Member;
  date: string;
  today: DaySessions;
  usualTimes: Partial<Record<Slot, string>>;
  daysWithUs: number;
  durations: Record<Minutes, number>;
  rank: { place: number; total: number } | null;
  newcomerDaysLeft: number;
}

/** Everything /me shows about a member, in the group and (in more detail) in private. */
export async function personalStats(chatId: number, settings: ChatSettings, member: Member): Promise<PersonalStats> {
  const today = practiceDate(settings);
  const dates = dateRange(addDays(today, -30), today);
  const [list, all] = await Promise.all([
    checkinsOfMember(chatId, member.userId, dates).then((l) => l.filter((c) => c.status === 'done' && c.minutes)),
    listMembers(chatId),
  ]);

  const todayDone = doneSessions(list).get(sessionKey(today, member.userId)) ?? {};
  const live = withToday(member, today, todayDone, settings);

  const firstAt = (slot: Slot) => list.filter((c) => c.slot === slot).map((c) => c.firstAt);
  const durations: Record<Minutes, number> = { 60: 0, 30: 0, 15: 0 };
  for (const c of list) durations[c.minutes!] += 1;

  const ranked = rankMembers(all, settings.newcomerDays);
  const place = ranked.findIndex((m) => m.userId === member.userId);

  return {
    member: live,
    date: today,
    today: todayDone,
    usualTimes: { morning: usualTime(settings, firstAt('morning')), evening: usualTime(settings, firstAt('evening')) },
    daysWithUs: dateRange(member.joinedDate, today).length,
    durations,
    rank: place >= 0 ? { place: place + 1, total: ranked.length } : null,
    newcomerDaysLeft: Math.max(settings.newcomerDays - member.activeDays, 0),
  };
}

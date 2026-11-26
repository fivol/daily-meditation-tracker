import { withToday, type DaySessions } from '../stats.js';
import { personalHistory, type PersonalHistory } from '../summary.js';
import { addDays, dateRange, practiceDate, usualTime } from '../time.js';
import type { ChatSettings, Member, Slot } from '../types.js';
import { doneSessions, sessionKey } from './checkins.js';
import { loadPersonalCheckins } from './history.js';

export interface PersonalStats {
  /** Aggregates with today's sessions already counted. */
  member: Member;
  date: string;
  today: DaySessions;
  /** Typical check-in times over the last 30 days. */
  usualTimes: Partial<Record<Slot, string>>;
  daysWithUs: number;
  /** The member's whole history: windows, weeks, calendar. */
  history: PersonalHistory;
}

/** Everything /me shows about a member, in the group and (in more detail) in private. */
export async function personalStats(chatId: number, settings: ChatSettings, member: Member): Promise<PersonalStats> {
  const today = practiceDate(settings);
  const done = (await loadPersonalCheckins(chatId, member.userId)).filter((c) => c.status === 'done' && c.minutes);

  const todayDone = doneSessions(done).get(sessionKey(today, member.userId)) ?? {};
  const live = withToday(member, today, todayDone, settings);

  const monthAgo = addDays(today, -30);
  const firstAt = (slot: Slot) => done.filter((c) => c.slot === slot && c.date >= monthAgo).map((c) => c.firstAt);

  return {
    member: live,
    date: today,
    today: todayDone,
    usualTimes: { morning: usualTime(settings, firstAt('morning')), evening: usualTime(settings, firstAt('evening')) },
    daysWithUs: dateRange(member.joinedDate, today).length,
    history: personalHistory(live, done, settings, today),
  };
}

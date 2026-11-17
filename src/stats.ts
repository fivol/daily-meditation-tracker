import { CLOCK_DAYS, GONG_BEFORE, OWL_AFTER, RECENT_DAYS } from './config.js';
import { clockFromDayStart, minutesFromDayStart } from './time.js';
import type { ChatSettings, DayStatus, Member, MemberStats, Minutes, Slot } from './types.js';

/** One done session as the reducer sees it. */
export interface Session {
  minutes: Minutes;
  /** When the current vote was placed (ISO). */
  at: string;
  source: 'poll' | 'admin';
  /** Replaced a "didn't practice" vote. */
  rescued: boolean;
}

/** Sessions a member did in one day, by slot (absent slot = no session). */
export type DaySessions = Partial<Record<Slot, Session>>;

/** Chat settings the reducer needs for the time-based counters. */
export type DayRules = Pick<ChatSettings, 'timezone' | 'dayBoundaryHour' | 'schedule'>;

export function emptyStats(): MemberStats {
  return {
    activeDays: 0,
    sessions: 0,
    morningSessions: 0,
    eveningSessions: 0,
    minutes: 0,
    practicedDays: 0,
    fullDays: 0,
    currentStreak: 0,
    bestStreak: 0,
    missedInRow: 0,
    lastPracticeDate: null,
    recent: [],
    fullHourRun: 0,
    hourRun: 0,
    bothRun: 0,
    gongRun: 0,
    morningTimes: [],
    noReminderRun: 0,
    pausedSessions: 0,
    owlCount: 0,
    rescuedCount: 0,
    brokenBest: 0,
  };
}

/** Fills counters missing in documents written before they existed. */
export function withStatsDefaults<T extends Partial<MemberStats>>(data: T): T & MemberStats {
  return { ...emptyStats(), ...data };
}

const run = (current: number, qualifies: boolean) => (qualifies ? current + 1 : 0);

/**
 * Applies one closed day to a member's aggregates and returns the new aggregates.
 * Practicing always counts, even on a paused day; a paused day without practice
 * freezes the streak and every achievement run, and resets the missed-day counter.
 */
export function applyDay(
  stats: MemberStats,
  date: string,
  baseStatus: DayStatus,
  done: DaySessions,
  rules: DayRules,
): MemberStats {
  const { morning, evening } = done;
  const sessions = (morning ? 1 : 0) + (evening ? 1 : 0);
  const minutes = (morning?.minutes ?? 0) + (evening?.minutes ?? 0);
  const status: DayStatus = sessions > 0 ? 'active' : baseStatus;
  const next: MemberStats = { ...withStatsDefaults(stats), recent: [...stats.recent] };

  if (status === 'active') {
    next.activeDays += 1;
    next.sessions += sessions;
    next.morningSessions += morning ? 1 : 0;
    next.eveningSessions += evening ? 1 : 0;
    next.minutes += minutes;
    if (sessions > 0) {
      next.practicedDays += 1;
      next.fullDays += sessions === 2 ? 1 : 0;
      next.currentStreak += 1;
      next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
      next.missedInRow = 0;
      next.lastPracticeDate = date;
    } else {
      next.brokenBest = Math.max(next.brokenBest, next.currentStreak);
      next.currentStreak = 0;
      next.missedInRow += 1;
    }
    applyAchievementCounters(next, done, baseStatus, rules);
  } else if (status === 'paused') {
    next.missedInRow = 0;
  }

  next.recent.push({ date, status, sessions, minutes });
  if (next.recent.length > RECENT_DAYS) next.recent.splice(0, next.recent.length - RECENT_DAYS);
  return next;
}

/** Updates the achievement counters for an active day (mutates `next`). */
function applyAchievementCounters(next: MemberStats, done: DaySessions, baseStatus: DayStatus, rules: DayRules) {
  const { morning, evening } = done;
  const sessions = [morning, evening].filter((s): s is Session => Boolean(s));
  // Admin fixes carry no real check-in time, so they don't count for the time-based ones.
  const timeOf = (s: Session | undefined) =>
    s && s.source === 'poll' ? minutesFromDayStart(rules, s.at) : null;

  next.fullHourRun = run(next.fullHourRun, morning?.minutes === 60 && evening?.minutes === 60);
  next.hourRun = run(next.hourRun, sessions.some((s) => s.minutes === 60));
  next.bothRun = run(next.bothRun, sessions.length === 2);

  const morningTime = morning && morning.minutes >= 30 ? timeOf(morning) : null;
  next.gongRun = run(next.gongRun, morningTime !== null && morningTime < clockFromDayStart(rules, GONG_BEFORE));
  next.morningTimes = morningTime === null ? [] : [...next.morningTimes, morningTime].slice(-CLOCK_DAYS);

  const times = sessions.map(timeOf);
  const first = times.every((t) => t !== null) && times.length ? Math.min(...(times as number[])) : null;
  next.noReminderRun = run(next.noReminderRun, first !== null && first < clockFromDayStart(rules, rules.schedule.reminder));

  const eveningTime = timeOf(evening);
  if (eveningTime !== null && eveningTime >= clockFromDayStart(rules, OWL_AFTER)) next.owlCount += 1;
  next.rescuedCount += sessions.filter((s) => s.rescued).length;
  if (baseStatus === 'paused') next.pausedSessions += sessions.length;
}

/** How a member takes part in a day before their check-ins are considered. */
export function baseStatusOf(m: Member, date: string): DayStatus {
  if (m.status === 'removed') return 'absent';
  if (m.status === 'paused' && (!m.pauseUntil || m.pauseUntil >= date)) return 'paused';
  return 'active';
}

/**
 * Member with today's sessions already counted. Regularity stays on closed days, so a day with
 * only the morning done doesn't drag it down until the evening.
 */
export function withToday(member: Member, today: string, done: DaySessions, rules: DayRules): Member {
  if (!done.morning && !done.evening) return member;
  return { ...member, ...applyDay(member, today, baseStatusOf(member, today), done, rules), recent: member.recent };
}

/** Regularity over the recent window: sessions / (2 × active days), 0..1. */
export function regularity(stats: Pick<MemberStats, 'recent'>): number {
  const active = stats.recent.filter((d) => d.status === 'active');
  if (active.length === 0) return 0;
  const sessions = active.reduce((sum, d) => sum + d.sessions, 0);
  return sessions / (2 * active.length);
}

export function recentSessions(stats: Pick<MemberStats, 'recent'>): number {
  return stats.recent.reduce((sum, d) => sum + d.sessions, 0);
}

export function recentMinutes(stats: Pick<MemberStats, 'recent'>): number {
  return stats.recent.reduce((sum, d) => sum + d.minutes, 0);
}

/** Leaderboard order: practice time over the recent window, then regularity, then all-time time. */
export function compareMembers(a: Member, b: Member): number {
  return (
    recentMinutes(b) - recentMinutes(a) ||
    regularity(b) - regularity(a) ||
    b.minutes - a.minutes ||
    a.firstName.localeCompare(b.firstName)
  );
}

/** Members that take a place in the leaderboard (everyone active), in leaderboard order. */
export function rankMembers(members: Member[]): Member[] {
  return members.filter((m) => m.status === 'active').sort(compareMembers);
}

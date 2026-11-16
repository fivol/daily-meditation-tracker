import {
  HOURS_MILESTONE_STEP,
  RECENT_DAYS,
  SESSION_MILESTONE_STEP,
  STREAK_MILESTONES,
} from './config.js';
import type { DayStatus, Member, MemberStats, Minutes, Slot } from './types.js';

/** Sessions a member did in one day, by slot (absent slot = no session). */
export type DaySessions = Partial<Record<Slot, Minutes>>;

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
  };
}

/**
 * Applies one closed day to a member's aggregates and returns the new aggregates.
 * Practicing always counts, even on a paused day; a paused day without practice
 * freezes the streak and resets the missed-day counter.
 */
export function applyDay(
  stats: MemberStats,
  date: string,
  baseStatus: DayStatus,
  done: DaySessions,
): MemberStats {
  const sessions = (done.morning ? 1 : 0) + (done.evening ? 1 : 0);
  const minutes = (done.morning ?? 0) + (done.evening ?? 0);
  const status: DayStatus = sessions > 0 ? 'active' : baseStatus;
  const next: MemberStats = { ...stats, recent: [...stats.recent] };

  if (status === 'active') {
    next.activeDays += 1;
    next.sessions += sessions;
    next.morningSessions += done.morning ? 1 : 0;
    next.eveningSessions += done.evening ? 1 : 0;
    next.minutes += minutes;
    if (sessions > 0) {
      next.practicedDays += 1;
      next.fullDays += sessions === 2 ? 1 : 0;
      next.currentStreak += 1;
      next.bestStreak = Math.max(next.bestStreak, next.currentStreak);
      next.missedInRow = 0;
      next.lastPracticeDate = date;
    } else {
      next.currentStreak = 0;
      next.missedInRow += 1;
    }
  } else if (status === 'paused') {
    next.missedInRow = 0;
  }

  next.recent.push({ date, status, sessions, minutes });
  if (next.recent.length > RECENT_DAYS) next.recent.splice(0, next.recent.length - RECENT_DAYS);
  return next;
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

/** Leaderboard order: recent regularity, then recent sessions, then all-time sessions. */
export function compareMembers(a: Member, b: Member): number {
  return (
    regularity(b) - regularity(a) ||
    recentSessions(b) - recentSessions(a) ||
    b.sessions - a.sessions ||
    a.firstName.localeCompare(b.firstName)
  );
}

export type Milestone =
  | { kind: 'streak'; value: number }
  | { kind: 'sessions'; value: number }
  | { kind: 'hours'; value: number };

/** Milestones reached by moving from `before` to `after`. */
export function reachedMilestones(before: MemberStats, after: MemberStats): Milestone[] {
  const result: Milestone[] = [];
  if (after.currentStreak > before.currentStreak && STREAK_MILESTONES.includes(after.currentStreak)) {
    result.push({ kind: 'streak', value: after.currentStreak });
  }
  const crossed = (from: number, to: number, step: number) =>
    Math.floor(to / step) > Math.floor(from / step) ? Math.floor(to / step) * step : null;
  const sessions = crossed(before.sessions, after.sessions, SESSION_MILESTONE_STEP);
  if (sessions) result.push({ kind: 'sessions', value: sessions });
  const hours = crossed(before.minutes / 60, after.minutes / 60, HOURS_MILESTONE_STEP);
  if (hours) result.push({ kind: 'hours', value: hours });
  return result;
}

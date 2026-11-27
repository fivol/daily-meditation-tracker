import { addDays, addMonths, dateRange, localHour, minutesFromDayStart, monthsBetween, weekday, weekStart } from './time.js';
import type { Checkin, ChatSettings, DayStatus, Member, Minutes, Slot } from './types.js';

export type PeriodKind = 'week' | 'month' | 'year';

export interface DateRange {
  from: string;
  to: string;
}

/** A summary period and, when the history is long enough, the equal period right before it. */
export interface Period extends DateRange {
  kind: PeriodKind;
  prev?: DateRange;
}

/**
 * Summary periods that end with the closed day `date`: a week ends on Sunday, a month and a
 * year on the monthly / yearly anniversaries of the chat's first day. Shortest first.
 */
export function periodsEndingOn(startDate: string, date: string): Period[] {
  const result: Period[] = [];
  if (weekday(date) === 7) {
    const from = addDays(date, -6) < startDate ? startDate : addDays(date, -6);
    const prevFrom = addDays(from, -7);
    result.push({ kind: 'week', from, to: date, prev: prevFrom >= startDate ? { from: prevFrom, to: addDays(from, -1) } : undefined });
  }
  const months = monthsBetween(startDate, addDays(date, 1));
  if (months !== null) {
    const from = addMonths(startDate, months - 1);
    const prev = months >= 2 ? { from: addMonths(startDate, months - 2), to: addDays(from, -1) } : undefined;
    result.push({ kind: 'month', from, to: date, prev });
    // A year is compared with nothing: its own monthly bars already show the trend.
    if (months % 12 === 0) result.push({ kind: 'year', from: addMonths(startDate, months - 12), to: date });
  }
  return result;
}

/** The latest period of a kind ending on `date`, whatever the calendar says (for on-demand summaries). */
export function latestPeriod(kind: PeriodKind, startDate: string, date: string): Period {
  const next = addDays(date, 1);
  const begin = kind === 'week' ? addDays(next, -7) : addMonths(next, kind === 'month' ? -1 : -12);
  const from = begin < startDate ? startDate : begin;
  const length = dateRange(from, date).length;
  const prevFrom = addDays(from, -length);
  return {
    kind,
    from,
    to: date,
    prev: kind !== 'year' && prevFrom >= startDate ? { from: prevFrom, to: addDays(from, -1) } : undefined,
  };
}

/** Raw history a summary is built from. */
export interface HistoryData {
  members: Member[];
  /** Day-close snapshots: date → user id → status. */
  statuses: Map<string, Record<string, DayStatus>>;
  /** Done check-ins of the period and the one before it. */
  checkins: Checkin[];
}

export interface Totals {
  sessions: number;
  minutes: number;
  /** Sessions possible: 2 per member per active day. */
  possible: number;
  /** Members who practiced at least once. */
  people: number;
}

/** One day (or one bucket of days) of the group. */
export interface DayPoint {
  date: string;
  /** Minutes by slot. */
  morning: number;
  evening: number;
  sessions: number;
  possible: number;
}

/** One member's period. */
export interface PersonSummary {
  member: Member;
  sessions: number;
  minutes: number;
  activeDays: number;
  practicedDays: number;
  /** Days with both sessions. */
  fullDays: number;
  /** Minutes in the previous period; null when the member wasn't around then. */
  prevMinutes: number | null;
  /** Titles and achievements dated within the period. */
  awards: string[];
}

export interface TitleCount {
  level: number;
  count: number;
  /** Members who reached this title within the period. */
  fresh: number;
}

export type SlotHours = Record<Slot, number[]>;

export interface GroupSummary {
  period: Period;
  totals: Totals;
  prev: Totals | null;
  days: DayPoint[];
  /** Everyone with at least one active day in the period, alphabetically. */
  people: PersonSummary[];
  durations: Record<Minutes, number>;
  /** Sessions by slot. */
  slots: Record<Slot, number>;
  /** Check-ins by slot and local hour (0–23). */
  hours: SlotHours;
  /** Monday first. */
  weekdays: { sessions: number; possible: number }[];
  /** Minutes the group has practiced since its first day. */
  totalMinutes: number;
  /** Members currently on a streak of a week / a month or longer. */
  streaks: { week: number; month: number };
  titles: TitleCount[];
  /** Group achievements earned within the period. */
  groupAwards: string[];
}

type SlotMinutes = Partial<Record<Slot, number>>;

const within = (date: string, range: DateRange) => date >= range.from && date <= range.to;

/** date → user id → minutes by slot. */
function sessionsByDay(checkins: Checkin[]): Map<string, Map<string, SlotMinutes>> {
  const result = new Map<string, Map<string, SlotMinutes>>();
  for (const c of checkins) {
    if (c.status !== 'done' || !c.minutes) continue;
    const day = result.get(c.date) ?? new Map<string, SlotMinutes>();
    day.set(String(c.userId), { ...day.get(String(c.userId)), [c.slot]: c.minutes });
    result.set(c.date, day);
  }
  return result;
}

interface PersonAcc {
  sessions: number;
  minutes: number;
  activeDays: number;
  practicedDays: number;
  fullDays: number;
}

/** Per-day and per-person sums of a date range. Practicing counts as an active day, even on a pause. */
function collect(range: DateRange, data: HistoryData, byDay: Map<string, Map<string, SlotMinutes>>) {
  const days: DayPoint[] = [];
  const persons = new Map<string, PersonAcc>();
  for (const date of dateRange(range.from, range.to)) {
    const statuses = data.statuses.get(date) ?? {};
    const done = byDay.get(date) ?? new Map<string, SlotMinutes>();
    const point: DayPoint = { date, morning: 0, evening: 0, sessions: 0, possible: 0 };
    for (const userId of new Set([...Object.keys(statuses), ...done.keys()])) {
      const slots = done.get(userId) ?? {};
      const sessions = Object.keys(slots).length;
      if (sessions === 0 && statuses[userId] !== 'active') continue;
      const minutes = (slots.morning ?? 0) + (slots.evening ?? 0);
      point.morning += slots.morning ?? 0;
      point.evening += slots.evening ?? 0;
      point.sessions += sessions;
      point.possible += 2;
      const acc = persons.get(userId) ?? { sessions: 0, minutes: 0, activeDays: 0, practicedDays: 0, fullDays: 0 };
      acc.sessions += sessions;
      acc.minutes += minutes;
      acc.activeDays += 1;
      acc.practicedDays += sessions > 0 ? 1 : 0;
      acc.fullDays += sessions === 2 ? 1 : 0;
      persons.set(userId, acc);
    }
    days.push(point);
  }
  const totals: Totals = {
    sessions: days.reduce((sum, d) => sum + d.sessions, 0),
    minutes: days.reduce((sum, d) => sum + d.morning + d.evening, 0),
    possible: days.reduce((sum, d) => sum + d.possible, 0),
    people: [...persons.values()].filter((p) => p.sessions > 0).length,
  };
  return { days, persons, totals };
}

const emptyHours = (): SlotHours => ({ morning: Array(24).fill(0), evening: Array(24).fill(0) });

/** Durations and check-in hours of done sessions. Admin fixes carry no real time, so they skip the hours. */
function sessionShape(checkins: Checkin[], settings: Pick<ChatSettings, 'timezone' | 'dayBoundaryHour'>) {
  const durations: Record<Minutes, number> = { 60: 0, 45: 0, 30: 0, 15: 0 };
  const hours = emptyHours();
  const slots: Record<Slot, number> = { morning: 0, evening: 0 };
  for (const c of checkins) {
    if (c.status !== 'done' || !c.minutes) continue;
    durations[c.minutes] += 1;
    slots[c.slot] += 1;
    if (c.source === 'poll') hours[c.slot][localHour(settings, c.updatedAt)] += 1;
  }
  return { durations, slots, hours };
}

/** Group summary of a period: totals, daily series, generalized stats about people. */
export function summarize(
  period: Period,
  data: HistoryData,
  settings: Pick<ChatSettings, 'timezone' | 'dayBoundaryHour' | 'awards'>,
): GroupSummary {
  const byDay = sessionsByDay(data.checkins);
  const current = collect(period, data, byDay);
  const previous = period.prev ? collect(period.prev, data, byDay) : null;
  const byId = new Map(data.members.map((m) => [String(m.userId), m]));

  const people: PersonSummary[] = [...current.persons.entries()]
    .flatMap(([userId, acc]) => {
      const member = byId.get(userId);
      if (!member) return [];
      const awards = Object.entries(member.awards ?? {}).filter(([, a]) => within(a.date, period)).map(([id]) => id);
      return [{ member, ...acc, prevMinutes: previous?.persons.get(userId)?.minutes ?? null, awards }];
    })
    .sort((a, b) => a.member.firstName.localeCompare(b.member.firstName, 'ru'));

  const weekdays = Array.from({ length: 7 }, () => ({ sessions: 0, possible: 0 }));
  for (const d of current.days) {
    weekdays[weekday(d.date) - 1].sessions += d.sessions;
    weekdays[weekday(d.date) - 1].possible += d.possible;
  }

  const present = data.members.filter((m) => m.status !== 'removed');
  const titles: TitleCount[] = [];
  for (const m of present) {
    if (!m.title) continue;
    const entry = titles.find((t) => t.level === m.title) ?? titles[titles.push({ level: m.title, count: 0, fresh: 0 }) - 1];
    entry.count += 1;
    const reached = m.awards?.[`title:${m.title}`]?.date;
    if (reached && within(reached, period)) entry.fresh += 1;
  }
  titles.sort((a, b) => a.level - b.level);

  return {
    period,
    totals: current.totals,
    prev: previous && previous.totals.possible > 0 ? previous.totals : null,
    days: current.days,
    people,
    ...sessionShape(data.checkins.filter((c) => within(c.date, period)), settings),
    weekdays,
    totalMinutes: data.members.reduce((sum, m) => sum + m.minutes, 0),
    streaks: {
      week: present.filter((m) => m.currentStreak >= 7).length,
      month: present.filter((m) => m.currentStreak >= 30).length,
    },
    titles,
    groupAwards: Object.entries(settings.awards ?? {}).filter(([, date]) => within(date, period)).map(([id]) => id),
  };
}

/** Days with practice per week, scaled to a 7-day week (the period may be longer or shorter). */
export function daysPerWeek(p: Pick<PersonSummary, 'practicedDays' | 'activeDays'>): number {
  return p.activeDays > 0 ? (7 * p.practicedDays) / p.activeDays : 0;
}

/** Sums consecutive days into calendar weeks (Monday first) — for long periods. */
export function byWeek(days: DayPoint[]): DayPoint[] {
  const result: DayPoint[] = [];
  for (const d of days) {
    const start = weekStart(d.date);
    const last = result.at(-1);
    if (last && weekStart(last.date) === start) {
      last.morning += d.morning;
      last.evening += d.evening;
      last.sessions += d.sessions;
      last.possible += d.possible;
    } else {
      result.push({ ...d });
    }
  }
  return result;
}

/** A window of a member's own practice. */
export interface PersonalWindow {
  sessions: number;
  /** Sessions possible; 0 when nothing is closed yet. */
  possible: number;
  minutes: number;
  /** Minutes in the equal window right before; null when the member wasn't around then. */
  prevMinutes: number | null;
}

/** A member's whole history, shaped for the personal dashboard and the detailed /me. */
export interface PersonalHistory {
  /** First day shown (the member's first day with us) and the current practice day. */
  from: string;
  to: string;
  /** date → minutes by slot, practiced days only. */
  days: Map<string, SlotMinutes>;
  /** Days of the last 30 closed ones spent on a pause. */
  paused: Set<string>;
  windows: { week: PersonalWindow; month: PersonalWindow; all: PersonalWindow };
  /** Calendar weeks up to the current one, oldest first. */
  weeks: DayPoint[];
  durations: Record<Minutes, number>;
  slots: Record<Slot, number>;
  hours: SlotHours;
  /** Days with practice by weekday, Monday first. */
  weekdays: number[];
}

/** How many calendar weeks the personal dashboard shows as bars. */
export const PERSONAL_WEEKS = 12;

/**
 * Builds a member's history from all their done check-ins. `member` already includes today's
 * sessions; regularity windows stay on closed days, like everywhere else.
 */
export function personalHistory(
  member: Member,
  checkins: Checkin[],
  settings: Pick<ChatSettings, 'timezone' | 'dayBoundaryHour'>,
  today: string,
): PersonalHistory {
  const done = checkins.filter((c) => c.status === 'done' && c.minutes);
  const days = new Map<string, SlotMinutes>();
  for (const c of done) days.set(c.date, { ...days.get(c.date), [c.slot]: c.minutes! });
  const minutesOf = (date: string) => (days.get(date)?.morning ?? 0) + (days.get(date)?.evening ?? 0);
  const firstDay = [...days.keys()].sort()[0];
  const from = firstDay && firstDay < member.joinedDate ? firstDay : member.joinedDate;

  const closed = member.recent;
  const window = (entries: typeof closed, before: typeof closed | null): PersonalWindow => ({
    sessions: entries.reduce((sum, d) => sum + d.sessions, 0),
    possible: 2 * entries.filter((d) => d.status === 'active').length,
    minutes: entries.reduce((sum, d) => sum + d.minutes, 0),
    prevMinutes: before ? before.reduce((sum, d) => sum + d.minutes, 0) : null,
  });
  // The 30 days before the stored window come from the check-ins themselves.
  const monthStart = closed[0]?.date;
  const beforeMonth =
    closed.length === 30 && monthStart && addDays(monthStart, -30) >= from
      ? dateRange(addDays(monthStart, -30), addDays(monthStart, -1)).reduce((sum, d) => sum + minutesOf(d), 0)
      : null;

  const firstWeek = weekStart(addDays(today, -7 * (PERSONAL_WEEKS - 1)));
  const weeks = byWeek(
    dateRange(firstWeek, today).map((date) => ({
      date,
      morning: days.get(date)?.morning ?? 0,
      evening: days.get(date)?.evening ?? 0,
      sessions: Object.keys(days.get(date) ?? {}).length,
      possible: 2,
    })),
  );

  const weekdays = Array(7).fill(0) as number[];
  for (const date of days.keys()) weekdays[weekday(date) - 1] += 1;

  return {
    from,
    to: today,
    days,
    paused: new Set(closed.filter((d) => d.status === 'paused').map((d) => d.date)),
    windows: {
      week: window(closed.slice(-7), closed.length >= 14 ? closed.slice(-14, -7) : null),
      month: { ...window(closed, null), prevMinutes: beforeMonth },
      all: { sessions: member.sessions, possible: 2 * member.activeDays, minutes: member.minutes, prevMinutes: null },
    },
    weeks,
    ...sessionShape(done, settings),
    weekdays,
  };
}

/** A done session placed on the practice day. */
export interface Moment {
  slot: Slot;
  minutes: Minutes;
  /** Minutes from the start of the practice day (the boundary hour). */
  at: number;
}

/** One closed day of the group, for the picture under the daily leaderboard. */
export interface DaySummary {
  date: string;
  sessions: number;
  possible: number;
  minutes: number;
  people: number;
  /** People who did both sessions. */
  both: number;
  durations: Record<Minutes, number>;
  /** Poll check-ins by time of day; admin fixes carry no real time and are left out. */
  moments: Moment[];
  /** Members on a streak of a week or longer after the day. */
  streaks: number;
  /** People who got a title or an achievement for the day. */
  awarded: number;
}

/**
 * Aggregates a closed day. `members` are read after the close, so each one's last `recent`
 * entry is that day; `checkins` are the day's check-ins.
 */
export function summarizeDay(
  date: string,
  members: Member[],
  checkins: Checkin[],
  settings: Pick<ChatSettings, 'timezone' | 'dayBoundaryHour'>,
): DaySummary {
  const entries = members.flatMap((m) => {
    const entry = m.recent.at(-1);
    return entry?.date === date ? [{ m, entry }] : [];
  });
  const counted = new Set(entries.map((e) => e.m.userId));
  const done = checkins.filter((c) => c.date === date && c.status === 'done' && c.minutes && counted.has(c.userId));

  const durations: Record<Minutes, number> = { 60: 0, 45: 0, 30: 0, 15: 0 };
  for (const c of done) durations[c.minutes!] += 1;
  // A vote changed from "didn't practice" keeps its first time, so it is placed by the last one.
  const moments = done
    .filter((c) => c.source === 'poll')
    .map((c) => ({ slot: c.slot, minutes: c.minutes!, at: minutesFromDayStart(settings, c.wasSkipped ? c.updatedAt : c.firstAt) }))
    .sort((a, b) => a.at - b.at);

  return {
    date,
    sessions: entries.reduce((sum, e) => sum + e.entry.sessions, 0),
    possible: 2 * entries.filter((e) => e.entry.status === 'active').length,
    minutes: entries.reduce((sum, e) => sum + e.entry.minutes, 0),
    people: entries.filter((e) => e.entry.sessions > 0).length,
    both: entries.filter((e) => e.entry.sessions === 2).length,
    durations,
    moments,
    streaks: entries.filter((e) => e.m.status === 'active' && e.m.currentStreak >= 7).length,
    awarded: entries.filter((e) => Object.values(e.m.awards ?? {}).some((a) => a.date === date)).length,
  };
}

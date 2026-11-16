import { DateTime } from 'luxon';
import type { ChatSettings } from './types.js';

type TimeSettings = Pick<ChatSettings, 'timezone' | 'dayBoundaryHour'>;

/** Practice date (YYYY-MM-DD) for a moment: the day starts at `dayBoundaryHour`, not midnight. */
export function practiceDate(settings: TimeSettings, now = DateTime.now()): string {
  return now.setZone(settings.timezone).minus({ hours: settings.dayBoundaryHour }).toISODate()!;
}

/** Moment when a local "HH:mm" time occurs within the given practice date. */
export function momentOf(settings: TimeSettings, date: string, hhmm: string): DateTime {
  const moment = DateTime.fromISO(`${date}T${hhmm}`, { zone: settings.timezone });
  // Times before the boundary (e.g. 01:00) belong to the next calendar day.
  return moment.hour < settings.dayBoundaryHour ? moment.plus({ days: 1 }) : moment;
}

export function addDays(date: string, n: number): string {
  return DateTime.fromISO(date).plus({ days: n }).toISODate()!;
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const result: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) result.push(d);
  return result;
}

export function isMonday(date: string): boolean {
  return DateTime.fromISO(date).weekday === 1;
}

export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value).isValid;
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** "вс 15 ноября" */
export function humanDate(date: string): string {
  return DateTime.fromISO(date).setLocale('ru').toFormat('ccc d MMMM');
}

/** "16 ноября" */
export function dayMonth(date: string): string {
  return DateTime.fromISO(date).setLocale('ru').toFormat('d MMMM');
}

/** "28.11" */
export function shortDate(date: string): string {
  return DateTime.fromISO(date).toFormat('dd.MM');
}

/**
 * Typical local time ("HH:mm") of the given moments: the median, measured from the day
 * boundary so that sessions logged after midnight don't skew it.
 */
export function usualTime(settings: TimeSettings, isoMoments: string[]): string | undefined {
  if (isoMoments.length === 0) return undefined;
  const offsets = isoMoments
    .map((iso) => {
      const local = DateTime.fromISO(iso).setZone(settings.timezone);
      const minutes = local.hour * 60 + local.minute - settings.dayBoundaryHour * 60;
      return (minutes + 24 * 60) % (24 * 60);
    })
    .sort((a, b) => a - b);
  const median = offsets[Math.floor(offsets.length / 2)];
  const minutes = (median + settings.dayBoundaryHour * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Minutes from the start of the practice day (the boundary hour) to a moment, 0..1439. */
export function minutesFromDayStart(settings: TimeSettings, iso: string): number {
  const local = DateTime.fromISO(iso).setZone(settings.timezone);
  return (local.hour * 60 + local.minute - settings.dayBoundaryHour * 60 + 24 * 60) % (24 * 60);
}

/** Same, for a local "HH:mm" time. */
export function clockFromDayStart(settings: TimeSettings, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60 + m - settings.dayBoundaryHour * 60 + 24 * 60) % (24 * 60);
}

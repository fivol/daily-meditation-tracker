// Chart blocks the dashboards are composed of. Each one draws into a box and returns SVG.
import { DateTime } from 'luxon';
import { addDays, dateRange, weekStart } from '../time.js';
import type { SlotHours } from '../summary.js';
import { C, PAD, circle, column, line, niceScale, pill, rect, text, textWidth, type Box, type Delta } from './svg.js';

export interface Tile {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  delta?: Delta | null;
}

/** Stat tile: label, one big value, an optional note and change. */
export function tile(box: Box, t: Tile, valueSize = 72): string {
  const x = box.x + PAD;
  const baseline = box.y + 62 + valueSize;
  const parts = [
    rect(box.x, box.y, box.w, box.h, { r: 32, stroke: C.border }),
    text(x, box.y + 54, t.label, { size: 24, fill: C.ink2 }),
    text(x, baseline, t.value, { size: valueSize, weight: 800 }),
  ];
  if (t.unit) {
    parts.push(text(x + textWidth(t.value, valueSize, 800) + 12, baseline, t.unit, { size: valueSize * 0.4, weight: 600, fill: C.ink2 }));
  }
  if (t.note) parts.push(text(x, baseline + 40, t.note, { size: 21, fill: C.ink3 }));
  if (t.delta) parts.push(pill(x, baseline + (t.note ? 62 : 22), t.delta).svg);
  return parts.join('');
}

/** Progress toward a goal: the track is a lighter step of the fill's own hue. */
export function meter(x: number, y: number, w: number, ratio: number, h = 14): string {
  const filled = Math.max(h, w * Math.min(Math.max(ratio, 0), 1));
  return rect(x, y, w, h, { r: h / 2, fill: C.teal[0] }) + rect(x, y, filled, h, { r: h / 2, fill: C.teal[2] });
}

export interface Bar {
  label: string;
  sub?: string;
  /** Lower segment (morning) and upper segment (evening), in axis units. */
  a: number;
  b: number;
  /** Direct label above the column. */
  value?: string;
}

/** Stacked columns on one baseline: morning below, evening above, a surface gap between them. */
export function columns(box: Box, bars: Bar[], tick: (value: number) => string): string {
  const axis = 58;
  const bottom = bars.some((b) => b.sub) ? 66 : 40;
  const top = 36;
  const plot = { x: box.x + axis, y: box.y + top, w: box.w - axis, h: box.h - top - bottom };
  const scale = niceScale(Math.max(...bars.map((b) => b.a + b.b), 0));
  const parts: string[] = [];
  for (let v = 0; v <= scale.max + 1e-9; v += scale.step) {
    const y = plot.y + plot.h - (v / scale.max) * plot.h;
    parts.push(line(plot.x, y, plot.x + plot.w, y, v === 0 ? C.border : C.grid));
    parts.push(text(plot.x - 14, y + 7, tick(v), { size: 20, fill: C.ink3, anchor: 'end' }));
  }
  const band = plot.w / bars.length;
  const width = Math.min(Math.max(band * 0.58, 6), 64);
  const gap = Math.min(3, width / 4);
  bars.forEach((bar, i) => {
    const x = plot.x + band * i + (band - width) / 2;
    const center = x + width / 2;
    const base = plot.y + plot.h;
    const hA = (bar.a / scale.max) * plot.h;
    const hB = (bar.b / scale.max) * plot.h;
    const lift = hA > 0 && hB > 0 ? gap : 0;
    if (hB > 0) {
      parts.push(rect(x, base - hA, width, hA, { fill: C.morning }));
      parts.push(column(x, base - hA - lift - hB, width, hB, 8, C.evening));
    } else {
      parts.push(column(x, base - hA, width, hA, 8, C.morning));
    }
    if (bar.value) parts.push(text(center, base - hA - lift - hB - 12, bar.value, { size: 22, weight: 700, anchor: 'middle' }));
    if (bar.label) parts.push(text(center, base + 30, bar.label, { size: 21, fill: C.ink2, anchor: 'middle' }));
    if (bar.sub) parts.push(text(center, base + 57, bar.sub, { size: 19, fill: C.ink3, anchor: 'middle' }));
  });
  return parts.join('');
}

export interface Point {
  label: string;
  /** 0..1, or null when there was nothing to measure. */
  value: number | null;
  /** Direct label above the point. */
  mark?: string;
}

const percentTick = (v: number) => `${Math.round(v * 100)}%`;

/** A share (0–100%) over time: thin line, light wash, a few direct labels. */
export function shareLine(box: Box, points: Point[], reference?: number): string {
  const axis = 70;
  const inset = 30;
  const plot = { x: box.x + axis, y: box.y + 44, w: box.w - axis, h: box.h - 44 - 44 };
  const xOf = (i: number) =>
    plot.x + inset + (points.length === 1 ? (plot.w - 2 * inset) / 2 : ((plot.w - 2 * inset) * i) / (points.length - 1));
  const yOf = (v: number) => plot.y + plot.h - v * plot.h;
  const parts: string[] = [];
  for (const v of [0, 0.5, 1]) {
    parts.push(line(plot.x, yOf(v), plot.x + plot.w, yOf(v), v === 0 ? C.border : C.grid));
    parts.push(text(plot.x - 14, yOf(v) + 7, percentTick(v), { size: 20, fill: C.ink3, anchor: 'end' }));
  }
  if (reference !== undefined) parts.push(line(plot.x, yOf(reference), plot.x + plot.w, yOf(reference), C.ink3, 2));
  // Runs of measured points; a gap in the data is a gap in the line.
  const runs: { i: number; v: number }[][] = [];
  points.forEach((p, i) => {
    if (p.value === null) return;
    const last = runs.at(-1);
    if (last && last.at(-1)!.i === i - 1) last.push({ i, v: p.value });
    else runs.push([{ i, v: p.value }]);
  });
  for (const run of runs) {
    const path = run.map((p, k) => `${k === 0 ? 'M' : 'L'}${xOf(p.i).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
    if (run.length > 1) {
      const area = `${path} L${xOf(run.at(-1)!.i).toFixed(1)},${yOf(0)} L${xOf(run[0].i).toFixed(1)},${yOf(0)} Z`;
      parts.push(`<path d="${area}" fill="${C.teal[2]}" fill-opacity="0.1"/>`);
      parts.push(`<path d="${path}" fill="none" stroke="${C.teal[2]}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`);
    }
  }
  points.forEach((p, i) => {
    if (p.label) parts.push(text(xOf(i), plot.y + plot.h + 32, p.label, { size: 21, fill: C.ink2, anchor: 'middle' }));
    if (p.value === null) return;
    if (points.length <= 14 || p.mark) parts.push(circle(xOf(i), yOf(p.value), 7, C.teal[2], C.card));
    if (p.mark) parts.push(text(xOf(i), yOf(p.value) - 16, p.mark, { size: 21, weight: 700, anchor: 'middle' }));
  });
  return parts.join('');
}

/** A growing total: wash and line from the first value to the last, ending in a dot. */
export function growthArea(box: Box, values: number[]): string {
  if (values.length < 2) return '';
  const min = values[0];
  const span = Math.max(values.at(-1)! - min, 1e-9);
  const xOf = (i: number) => box.x + (box.w - 10) * (i / (values.length - 1));
  const yOf = (v: number) => box.y + box.h - 6 - ((v - min) / span) * (box.h - 20);
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ');
  const base = box.y + box.h;
  return [
    `<path d="${path} L${xOf(values.length - 1).toFixed(1)},${base} L${box.x},${base} Z" fill="${C.teal[2]}" fill-opacity="0.12"/>`,
    `<path d="${path}" fill="none" stroke="${C.teal[2]}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`,
    line(box.x, base, box.x + box.w, base, C.border),
    circle(xOf(values.length - 1), yOf(values.at(-1)!), 8, C.teal[3], C.card),
  ].join('');
}

/** Check-ins by hour of the practice day, which starts at `startHour`. */
export function dayClock(box: Box, hours: SlotHours, startHour: number): string {
  const plot = { x: box.x, y: box.y + 8, w: box.w, h: box.h - 8 - 40 };
  const order = Array.from({ length: 24 }, (_, i) => (startHour + i) % 24);
  const max = Math.max(...order.map((h) => hours.morning[h] + hours.evening[h]), 1);
  const band = plot.w / 24;
  const width = Math.min(band * 0.66, 34);
  const base = plot.y + plot.h;
  const parts = [line(plot.x, base, plot.x + plot.w, base, C.border)];
  order.forEach((hour, i) => {
    const x = plot.x + band * i + (band - width) / 2;
    const hA = (hours.morning[hour] / max) * plot.h;
    const hB = (hours.evening[hour] / max) * plot.h;
    const lift = hA > 0 && hB > 0 ? 3 : 0;
    if (hB > 0) {
      parts.push(rect(x, base - hA, width, hA, { fill: C.morning }));
      parts.push(column(x, base - hA - lift - hB, width, hB, 6, C.evening));
    } else {
      parts.push(column(x, base - hA, width, hA, 6, C.morning));
    }
    if (i % 4 === 0) {
      const label = String(hour).padStart(2, '0') + (box.w < 500 ? '' : ':00');
      parts.push(text(plot.x + band * i + band / 2, base + 30, label, { size: 20, fill: C.ink3, anchor: 'middle' }));
    }
  });
  return parts.join('');
}

/** The busiest check-in hour of a slot as "7–8", or null when there are no check-ins. */
export function peakHour(counts: number[]): string | null {
  const max = Math.max(...counts);
  if (max <= 0) return null;
  const hour = counts.indexOf(max);
  return `${hour}–${(hour + 1) % 24}`;
}

export interface Part {
  label: string;
  value: number;
  color: string;
}

/** One whole split into parts: a tall segmented bar with shares inside and a legend below. */
export function segmented(x: number, y: number, w: number, parts: Part[]): string {
  const h = 44;
  const gap = 4;
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((sum, p) => sum + p.value, 0);
  const out: string[] = [];
  if (total === 0) out.push(rect(x, y, w, h, { r: 10, fill: C.track }));
  let cursor = x;
  const usable = w - gap * Math.max(shown.length - 1, 0);
  for (const p of shown) {
    const width = (p.value / total) * usable;
    const share = `${Math.round((100 * p.value) / total)}%`;
    out.push(rect(cursor, y, width, h, { r: 10, fill: p.color }));
    if (width > textWidth(share, 21, 700) + 28) out.push(text(cursor + 14, y + 30, share, { size: 21, weight: 700, fill: '#FFFFFF' }));
    cursor += width + gap;
  }
  let lx = x;
  for (const p of parts) {
    const label = `${p.label} · ${p.value}`;
    out.push(rect(lx, y + h + 20, 16, 16, { r: 5, fill: p.color }));
    out.push(text(lx + 24, y + h + 35, label, { size: 20, fill: C.ink2 }));
    lx += 24 + textWidth(label, 20) + 22;
  }
  return out.join('');
}

export interface Row {
  label: string;
  value: number;
  /** Text after the bar, e.g. "12 человек". */
  note: string;
}

/** Horizontal bars for a handful of groups, each labelled with its count. */
export function rows(box: Box, items: Row[], labelWidth: number): string {
  const max = Math.max(...items.map((r) => r.value), 1);
  const pitch = box.h / items.length;
  const thickness = Math.min(26, pitch * 0.5);
  const barX = box.x + labelWidth;
  const room = box.w - labelWidth - 170;
  const parts: string[] = [];
  items.forEach((item, i) => {
    const cy = box.y + pitch * i + pitch / 2;
    const width = item.value > 0 ? Math.max((item.value / max) * room, thickness) : 0;
    parts.push(text(box.x, cy + 8, item.label, { size: 23, fill: C.ink2 }));
    parts.push(rect(barX, cy - thickness / 2, room, thickness, { r: thickness / 2, fill: C.track }));
    if (width > 0) parts.push(rect(barX, cy - thickness / 2, width, thickness, { r: thickness / 2, fill: C.teal[2] }));
    parts.push(text(barX + room + 18, cy + 8, item.note, { size: 23, weight: 700 }));
  });
  return parts.join('');
}

/** Ring gauge of a share with the value in the middle. */
export function ring(cx: number, cy: number, r: number, ratio: number | null, stroke = 20): string {
  const track = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.teal[0]}" stroke-width="${stroke}"/>`;
  if (ratio === null) return track + text(cx, cy + 14, '—', { size: 40, weight: 800, anchor: 'middle', fill: C.ink3 });
  const length = 2 * Math.PI * r;
  const filled = Math.min(Math.max(ratio, 0), 1) * length;
  const arc =
    ratio > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.teal[2]}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${length.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>`
      : '';
  return track + arc + text(cx, cy + 15, `${Math.round(ratio * 100)}%`, { size: 42, weight: 800, anchor: 'middle' });
}

/** Heat steps by minutes practiced in a day. */
const HEAT = [
  { upTo: 30, color: C.teal[0], label: 'до 30 мин' },
  { upTo: 60, color: C.teal[1], label: 'до часа' },
  { upTo: 90, color: C.teal[2], label: 'до 1,5 ч' },
  { upTo: Infinity, color: C.teal[3], label: '2 часа' },
];

export interface Calendar {
  from: string;
  to: string;
  minutesOf: (date: string) => number;
  paused: Set<string>;
}

/** Weeks the calendar shows: the whole history, but at least 39 and at most 53. */
export function calendarWeeks(cal: Pick<Calendar, 'from' | 'to'>): number {
  const span = Math.round(DateTime.fromISO(weekStart(cal.to)).diff(DateTime.fromISO(weekStart(cal.from)), 'weeks').weeks) + 1;
  return Math.min(Math.max(span, 39), 53);
}

/**
 * Calendar of practice: a column per week, Monday on top, colour by minutes that day.
 */
export function heatmap(box: Box, cal: Calendar): string {
  const labels = 56;
  const lastWeek = weekStart(cal.to);
  const weeks = calendarWeeks(cal);
  const first = addDays(lastWeek, -7 * (weeks - 1));
  const pitch = Math.min((box.w - labels) / weeks, (box.h - 34 - 56) / 7);
  const size = pitch - Math.max(4, pitch * 0.14);
  const gridY = box.y + 34;
  const parts: string[] = [];
  ['пн', 'ср', 'пт', 'вс'].forEach((name, i) => {
    parts.push(text(box.x, gridY + pitch * (i * 2) + size / 2 + 7, name, { size: 19, fill: C.ink3 }));
  });
  let month = '';
  dateRange(first, addDays(lastWeek, 6)).forEach((date, index) => {
    const week = Math.floor(index / 7);
    const x = box.x + labels + week * pitch;
    const y = gridY + (index % 7) * pitch;
    const name = DateTime.fromISO(date).setLocale('ru').toFormat('LLL').replace('.', '');
    if (index % 7 === 0 && name !== month && DateTime.fromISO(date).day <= 7) {
      month = name;
      parts.push(text(x, box.y + 18, name, { size: 19, fill: C.ink3 }));
    }
    if (date > cal.to) return;
    if (date < cal.from) {
      parts.push(rect(x, y, size, size, { r: size * 0.26, fill: '#FAF7F1' }));
      return;
    }
    const minutes = cal.minutesOf(date);
    const fill = minutes > 0 ? HEAT.find((s) => minutes <= s.upTo)!.color : C.track;
    parts.push(rect(x, y, size, size, { r: size * 0.26, fill }));
    if (minutes === 0 && cal.paused.has(date)) parts.push(circle(x + size / 2, y + size / 2, size * 0.12, C.ink3));
  });
  let lx = box.x + labels;
  const ly = box.y + box.h - 6;
  for (const key of [{ color: C.track, label: 'без практики' }, ...HEAT]) {
    parts.push(rect(lx, ly - 17, 20, 20, { r: 6, fill: key.color }));
    parts.push(text(lx + 30, ly, key.label, { size: 20, fill: C.ink2 }));
    lx += 30 + textWidth(key.label, 20) + 30;
  }
  return parts.join('');
}

export interface DotRow {
  label: string;
  count: number;
  /** How many of the dots are highlighted (new in the period). */
  fresh: number;
}

/** A row of dots per group — one dot per person, nobody named. */
export function dotRows(box: Box, items: DotRow[], labelWidth: number): string {
  const pitch = Math.min(44, box.h / Math.max(items.length, 1));
  const r = Math.min(9, pitch * 0.24);
  const room = box.w - labelWidth - 50;
  const parts: string[] = [];
  items.forEach((item, i) => {
    const cy = box.y + pitch * i + pitch / 2;
    const step = Math.min(r * 2 + 8, room / Math.max(item.count, 1));
    parts.push(text(box.x, cy + 8, item.label, { size: 23, fill: C.ink2 }));
    for (let k = 0; k < item.count; k++) {
      const fresh = k >= item.count - item.fresh;
      parts.push(circle(box.x + labelWidth + r + k * step, cy, r, fresh ? C.accent : C.teal[2]));
    }
    parts.push(text(box.x + labelWidth + item.count * step + 14, cy + 8, String(item.count), { size: 23, weight: 700 }));
  });
  return parts.join('');
}

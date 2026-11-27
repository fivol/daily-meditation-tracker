// Picture under the daily leaderboard: one day of the group, without names. A narrower canvas
// than the period dashboards, so everything on it reads larger in a chat.
import { DateTime } from 'luxon';
import type { DaySummary, Moment } from '../summary.js';
import { ring, rows } from './blocks.js';
import { C, PAD, card, circle, document, hoursNumber, inner, legend, line, lotus, plural, text, type Box } from './svg.js';

const W = 1200;
const M = 48;
const GAP = 24;

const people = (n: number) => `${n} ${plural(n, 'человек', 'человека', 'человек')}`;
const clock = (fromDayStart: number, boundary: number) => {
  const minutes = (fromDayStart + boundary * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

/** Dot radius by session length: an hour is the biggest. */
const radius = (minutes: number) => 11 + (minutes / 60) * 13;

/**
 * Sessions on the time axis of the practice day, one dot each, piled up where they meet.
 * The first and the last check-in of the day get their time written above them.
 */
function timeline(box: Box, moments: Moment[], boundary: number): string {
  const top = 50;
  const plot = { x: box.x + 14, y: box.y + top, w: box.w - 28, h: box.h - top - 44 };
  const base = plot.y + plot.h;
  const xOf = (at: number) => plot.x + (at / (24 * 60)) * plot.w;
  const parts = [line(plot.x, base, plot.x + plot.w, base, C.border)];
  for (let h = 0; h <= 24; h += 4) {
    const x = xOf(h * 60);
    parts.push(line(x, base, x, base + 10, C.border));
    parts.push(text(x, base + 40, clock(h * 60, boundary), { size: 22, fill: C.ink3, anchor: h === 0 ? 'start' : h === 24 ? 'end' : 'middle' }));
  }
  // Each dot sits on the lowest level where it doesn't touch the dots already placed; in a big
  // group all dots shrink together until the piles fit under the time labels.
  const pile = (scale: number) => {
    const placed: { x: number; y: number; r: number }[] = [];
    for (const m of moments) {
      const r = radius(m.minutes) * scale;
      const x = xOf(m.at);
      const gap = 4 * scale;
      let y = base - r - 6;
      for (const other of [...placed].sort((a, b) => b.y - a.y)) {
        const dx = x - other.x;
        if (Math.hypot(dx, y - other.y) < r + other.r + gap) y = other.y - Math.sqrt(Math.max((r + other.r + gap) ** 2 - dx * dx, 0));
      }
      placed.push({ x, y, r });
    }
    return placed;
  };
  let scale = 1;
  let placed = pile(scale);
  while (scale > 0.3 && placed.some((p) => p.y - p.r < plot.y + 40)) placed = pile((scale -= 0.05));
  placed.forEach((p, i) => parts.push(circle(p.x, p.y, p.r, moments[i].slot === 'morning' ? C.morning : C.evening)));
  const mark = (i: number, anchor: 'start' | 'end') => {
    const p = placed[i];
    // Above every dot the label would cross: it reaches ~80 px to the inner side of the dot.
    const [from, to] = anchor === 'start' ? [p.x - p.r, p.x + 80] : [p.x - 80, p.x + p.r];
    const highest = Math.min(...placed.filter((q) => q.x + q.r > from && q.x - q.r < to).map((q) => q.y - q.r));
    return text(p.x + (anchor === 'start' ? -p.r : p.r), highest - 14, clock(moments[i].at, boundary), { size: 22, weight: 700, fill: C.ink2, anchor });
  };
  if (placed.length > 0) parts.push(mark(0, 'start'));
  if (placed.length > 1) parts.push(mark(placed.length - 1, 'end'));
  return parts.join('');
}

/** What there is to be glad about in the day, as counts; anything at zero is left out. */
function joys(s: DaySummary): { value: string; label: string }[] {
  const hourLong = s.durations[60];
  return [
    { n: s.both, label: 'и утром, и вечером' },
    { n: hourLong, label: plural(hourLong, 'сессия длиной в час', 'сессии длиной в час', 'сессий длиной в час') },
    { n: s.streaks, label: 'на серии от 7 дней' },
    { n: s.awarded, label: 'с новой наградой' },
    { n: s.people ? Math.round(s.minutes / s.people) : 0, label: 'минут на человека' },
  ]
    .filter((j) => j.n > 0)
    .slice(0, 4)
    .map((j) => ({ value: String(j.n), label: j.label }));
}

/** The day picture: the day in numbers, when we sat, how long, and the joys of the day. */
export function dayDashboard(s: DaySummary, boundaryHour: number): string {
  const date = DateTime.fromISO(s.date).setLocale('ru');
  const full = W - 2 * M;
  const body: string[] = [];

  body.push(lotus(M + 46, 158, 1.1));
  body.push(text(M + 134, 92, 'ПРАКТИКА ДНЯ', { size: 26, weight: 800, fill: C.accent, spacing: 3 }));
  body.push(text(M + 134, 160, date.toFormat('d MMMM'), { size: 68, weight: 800 }));
  body.push(text(M + 134, 202, date.toFormat('cccc'), { size: 28, fill: C.ink2 }));
  let y = 248;

  // The day in numbers: regularity as a ring, then time, sessions and people.
  const hero: Box = { x: M, y, w: full, h: 340 };
  body.push(card(hero));
  const cx = hero.x + hero.w - PAD - 190;
  body.push(ring(cx, hero.y + 150, 116, s.possible ? s.sessions / s.possible : null, 30));
  body.push(text(cx, hero.y + 306, 'регулярность', { size: 24, fill: C.ink3, anchor: 'middle' }));
  const facts = [
    { value: `${hoursNumber(s.minutes)} ч`, label: 'на подушке вместе' },
    { value: `${s.sessions} из ${s.possible}`, label: 'сессий группы' },
    { value: people(s.people), label: 'практиковали' },
  ];
  facts.forEach((f, i) => {
    const fy = hero.y + 96 + i * 96;
    body.push(text(hero.x + PAD + 10, fy, f.value, { size: 60, weight: 800 }));
    body.push(text(hero.x + PAD + 10, fy + 34, f.label, { size: 24, fill: C.ink3 }));
  });
  y += hero.h + GAP;

  // When we sat: every session on the day's clock.
  // A busy day gets a taller card, so the dots stay big enough to read.
  const when: Box = { x: M, y, w: full, h: 400 + Math.max(0, s.moments.length - 16) * 7 };
  body.push(card(when, 'Когда мы садились', 'каждая точка — сессия, чем крупнее, тем дольше'));
  body.push(legend(when.x + when.w - PAD, when.y + 58, [{ color: C.morning, label: 'утро' }, { color: C.evening, label: 'вечер' }]));
  body.push(timeline(inner(when, 110), s.moments, boundaryHour));
  y += when.h + GAP;

  // How long, and the joys of the day.
  const half = (full - GAP) / 2;
  const lengths: Box = { x: M, y, w: half, h: 360 };
  body.push(card(lengths, 'Как сидели', 'длина сессий'));
  const n = (k: 60 | 45 | 30 | 15) => s.durations[k];
  body.push(
    rows(
      inner(lengths, 120),
      [
        { label: '1 час', value: n(60), note: String(n(60)) },
        { label: '45 минут', value: n(45), note: String(n(45)) },
        { label: '30 минут', value: n(30), note: String(n(30)) },
        { label: '15 минут', value: n(15), note: String(n(15)) },
      ],
      120,
    ),
  );
  const glad: Box = { x: M + half + GAP, y, w: half, h: 360 };
  body.push(card(glad, 'Радости дня', 'сколько из нас — без имён'));
  joys(s).forEach((j, i) => {
    const jx = glad.x + PAD + (i % 2) * ((glad.w - 2 * PAD) / 2);
    const jy = glad.y + 186 + Math.floor(i / 2) * 110;
    body.push(text(jx, jy, j.value, { size: 52, weight: 800 }));
    body.push(text(jx, jy + 34, j.label, { size: 20, fill: C.ink2 }));
  });
  y += lengths.h;

  const height = y + 90;
  body.push(lotus(M + 16, height - 36, 0.32, C.ink3));
  body.push(text(M + 44, height - 38, 'Daily Meditation Tracker', { size: 22, weight: 600, fill: C.ink3 }));
  body.push(text(W - M, height - 38, 'Каждая сессия — часть общего пути', { size: 22, fill: C.ink3, anchor: 'end' }));
  return document(height, body, W);
}

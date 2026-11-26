// Personal dashboard: one member's whole practice — the last week, the last month, all time.
import { DateTime } from 'luxon';
import { ACHIEVEMENTS, achievementCount, titleAt } from '../awards.js';
import type { PersonalHistory, PersonalWindow } from '../summary.js';
import { dateRange, dayMonth } from '../time.js';
import type { Member } from '../types.js';
import { calendarWeeks, columns, dayClock, growthArea, heatmap, meter, peakHour, ring, segmented, tile, type Bar } from './blocks.js';
import { C, GAP, HEAD, M, PAD, W, card, circle, document, hoursNumber, inner, int, legend, lotus, pill, plural, text, type Box } from './svg.js';

const days = (count: number) => plural(count, 'день', 'дня', 'дней');

const WINDOWS: { key: keyof PersonalHistory['windows']; title: string; prev?: string }[] = [
  { key: 'week', title: 'Последние 7 дней', prev: 'к прошлым 7 дням' },
  { key: 'month', title: 'Последние 30 дней', prev: 'к прошлым 30 дням' },
  { key: 'all', title: 'За всё время' },
];

/** One window of practice: regularity ring, hours, sessions and growth against the window before. */
function windowCard(box: Box, title: string, w: PersonalWindow, note: string, prev?: string): string {
  const x = box.x + PAD + 190;
  const parts = [
    card(box, title),
    ring(box.x + PAD + 76, box.y + 178, 66, w.possible > 0 ? w.sessions / w.possible : null),
    text(x, box.y + 142, `${hoursNumber(w.minutes)} ч`, { size: 50, weight: 800 }),
    text(x, box.y + 178, w.possible > 0 ? `${int(w.sessions)} из ${int(w.possible)} сессий` : `${int(w.sessions)} ${plural(w.sessions, 'сессия', 'сессии', 'сессий')}`, { size: 22, fill: C.ink2 }),
  ];
  // Only growth is shown: the dashboard is for joy, not for bookkeeping of dips.
  if (prev && w.prevMinutes !== null && w.minutes > w.prevMinutes) {
    parts.push(pill(x, box.y + 196, { label: `+${hoursNumber(w.minutes - w.prevMinutes)} ч`, up: true }).svg);
    parts.push(text(x, box.y + 262, prev, { size: 19, fill: C.ink3 }));
  } else {
    parts.push(text(x, box.y + 212, note, { size: 20, fill: C.ink3 }));
  }
  return parts.join('');
}

/** Renders a member's personal dashboard as SVG. `member` already includes today's sessions. */
export function personalDashboard(m: Member, h: PersonalHistory, today: string): string {
  const body: string[] = [];
  const full = W - 2 * M;
  const third = (full - 2 * GAP) / 3;
  const title = m.title ? titleAt(m.title) : undefined;
  const next = titleAt((m.title ?? 0) + 1);
  const withUs = dateRange(m.joinedDate, today).length;
  let y = M - 8;

  // Header
  body.push(`<circle cx="${W - 150}" cy="40" r="230" fill="none" stroke="${C.border}" stroke-width="2"/>`);
  body.push(`<circle cx="${W - 150}" cy="40" r="150" fill="none" stroke="${C.border}" stroke-width="2"/>`);
  body.push(lotus(M + 44, y + 108, 1.25));
  body.push(text(M + 122, y + 44, 'МОЯ ПРАКТИКА', { size: 24, weight: 700, fill: C.accent, spacing: 3 }));
  body.push(text(M + 120, y + 104, m.firstName, { size: 60, weight: 800 }));
  body.push(
    text(M + 122, y + 144, [title?.name, `с нами ${withUs} ${days(withUs)}`, `с ${dayMonth(m.joinedDate)}`].filter(Boolean).join(' · '), { size: 25, fill: C.ink2 }),
  );
  body.push(text(W - M, y + 144, DateTime.fromISO(today).setLocale('ru').toFormat('d MMMM yyyy'), { size: 22, fill: C.ink3, anchor: 'end' }));
  y += 178;

  // Headline numbers
  const rowA = 250;
  const hero: Box = { x: M, y, w: 548, h: rowA };
  body.push(
    tile(hero, {
      label: 'Часов практики',
      value: hoursNumber(m.minutes),
      note: m.sessions > 0 ? `в среднем ${Math.round(m.minutes / m.sessions)} мин за сессию` : undefined,
    }, 112),
  );
  const tileW = (full - hero.w - 3 * GAP) / 3;
  const tiles = [
    { label: 'Сессий', value: int(m.sessions), note: `утро ${m.morningSessions} · вечер ${m.eveningSessions}` },
    { label: 'Серия сейчас', value: String(m.currentStreak), unit: days(m.currentStreak), note: `рекорд — ${m.bestStreak} ${days(m.bestStreak)}` },
    { label: 'Дней с практикой', value: int(m.practicedDays), note: `обе практики — ${m.fullDays}` },
  ];
  tiles.forEach((t, i) => body.push(tile({ x: hero.x + hero.w + GAP + i * (tileW + GAP), y, w: tileW, h: rowA }, t)));
  y += rowA + GAP;

  // Week, month, all time
  const rowB = 290;
  const perDay = (w: PersonalWindow, span: number) => `в среднем ${Math.round(w.minutes / Math.max(span, 1))} мин в день`;
  const notes = {
    week: perDay(h.windows.week, Math.min(m.recent.length, 7)),
    month: perDay(h.windows.month, m.recent.length),
    all: `в среднем ${hoursNumber((7 * m.minutes) / withUs)} ч в неделю`,
  };
  WINDOWS.forEach((w, i) =>
    body.push(windowCard({ x: M + i * (third + GAP), y, w: third, h: rowB }, w.title, h.windows[w.key], notes[w.key], w.prev)),
  );
  y += rowB + GAP;

  // Calendar of practice
  const minutesOf = (date: string) => (h.days.get(date)?.morning ?? 0) + (h.days.get(date)?.evening ?? 0);
  const cal = { from: h.from, to: h.to, minutesOf, paused: h.paused };
  const pitch = Math.min((full - 2 * PAD - 56) / calendarWeeks(cal), 36);
  const map: Box = { x: M, y, w: full, h: HEAD + 34 + 7 * pitch + 56 + PAD };
  body.push(card(map, 'Карта практики', 'каждый квадрат — день; чем темнее, тем больше времени на подушке'));
  body.push(heatmap(inner(map), cal));
  y += map.h + GAP;

  // Week by week, and the way to the next title
  const rowD = 430;
  const weekly: Box = { x: M, y, w: 968, h: rowD };
  const bars: Bar[] = h.weeks.map((w) => ({
    label: DateTime.fromISO(w.date).toFormat('d.MM'),
    a: w.morning / 60,
    b: w.evening / 60,
    value: w.morning + w.evening > 0 ? hoursNumber(w.morning + w.evening) : undefined,
  }));
  body.push(card(weekly, 'Неделя за неделей', 'часы практики; под столбцом — понедельник недели'));
  body.push(legend(weekly.x + weekly.w - PAD, weekly.y + 60, [{ color: C.morning, label: 'утро' }, { color: C.evening, label: 'вечер' }]));
  body.push(columns(inner(weekly, 112), bars, (v) => String(Number(v.toFixed(1))).replace('.', ',')));

  const path: Box = { x: weekly.x + weekly.w + GAP, y, w: full - weekly.w - GAP, h: rowD };
  let running = 0;
  const cumulative = [0, ...dateRange(h.from, h.to).map((date) => (running += minutesOf(date)))];
  body.push(card(path, 'Мой путь', 'часы практики с первого дня'));
  body.push(text(path.x + PAD, path.y + 176, `${hoursNumber(m.minutes)} ч`, { size: 64, weight: 800 }));
  body.push(growthArea({ x: path.x + PAD, y: path.y + 204, w: path.w - 2 * PAD, h: next ? 102 : 180 }, cumulative));
  if (next) {
    const from = title?.hours ?? 0;
    const left = Math.max(next.hours * 60 - m.minutes, 0);
    body.push(text(path.x + PAD, path.y + rowD - 74, `До звания «${next.name}» — ещё ${hoursNumber(left)} ч`, { size: 22, fill: C.ink2 }));
    body.push(meter(path.x + PAD, path.y + rowD - 54, path.w - 2 * PAD, (m.minutes / 60 - from) / (next.hours - from)));
  }
  y += rowD + GAP;

  // How and when I practice, achievements
  const rowE = 370;
  const how: Box = { x: M, y, w: third, h: rowE };
  body.push(card(how, 'Как я практикую', 'длина сессий и время дня'));
  body.push(
    segmented(how.x + PAD, how.y + 126, how.w - 2 * PAD, [
      { label: '1 ч', value: h.durations[60], color: C.teal[3] },
      { label: '30 мин', value: h.durations[30], color: C.teal[2] },
      { label: '15 мин', value: h.durations[15], color: C.teal[1] },
    ]),
  );
  body.push(
    segmented(how.x + PAD, how.y + 246, how.w - 2 * PAD, [
      { label: 'утро', value: h.slots.morning, color: C.morning },
      { label: 'вечер', value: h.slots.evening, color: C.evening },
    ]),
  );

  const clock: Box = { x: M + third + GAP, y, w: third, h: rowE };
  const peaks = [peakHour(h.hours.morning) && `утром в ${peakHour(h.hours.morning)} ч`, peakHour(h.hours.evening) && `вечером в ${peakHour(h.hours.evening)} ч`].filter(Boolean);
  body.push(card(clock, 'Когда отмечаюсь', peaks.join(', ') || 'отметки по часам суток'));
  body.push(dayClock(inner(clock, 124), h.hours, 4));

  const medals: Box = { x: M + 2 * (third + GAP), y, w: third, h: rowE };
  const earned = ACHIEVEMENTS.filter((a) => m.awards?.[a.id]);
  const count = achievementCount(m.awards);
  body.push(card(medals, 'Достижения'));
  body.push(text(medals.x + PAD, medals.y + 150, String(count), { size: 64, weight: 800 }));
  body.push(text(medals.x + PAD + (count > 9 ? 92 : 52), medals.y + 150, `из ${ACHIEVEMENTS.length}`, { size: 26, weight: 600, fill: C.ink2 }));
  ACHIEVEMENTS.forEach((a, i) => {
    const cx = medals.x + PAD + 12 + (i % 10) * 39;
    const cy = medals.y + 192 + Math.floor(i / 10) * 38;
    body.push(circle(cx, cy, 12, m.awards?.[a.id] ? C.teal[2] : C.track));
  });
  const latest = [...earned].sort((a, b) => m.awards![b.id].date.localeCompare(m.awards![a.id].date)).slice(0, 2);
  latest.forEach((a, i) => body.push(text(medals.x + PAD, medals.y + 290 + i * 32, `«${a.name}» · ${dayMonth(m.awards![a.id].date)}`, { size: 21, fill: C.ink2 })));
  if (!latest.length) body.push(text(medals.x + PAD, medals.y + 290, 'Первое уже рядом', { size: 21, fill: C.ink2 }));
  y += rowE + GAP;

  // Footer
  body.push(lotus(M + 16, y + 34, 0.5, C.ink3));
  body.push(text(M + 44, y + 30, 'Daily Meditation Tracker', { size: 21, weight: 600, fill: C.ink3 }));
  body.push(text(W - M, y + 30, 'Пусть практика приносит радость', { size: 21, fill: C.ink3, anchor: 'end' }));
  return document(y + 64, body);
}

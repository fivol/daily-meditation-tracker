// Group dashboard for a week, a month or a year. About the group as a whole: people appear
// only as anonymous counts, never as names or ranks.
import { DateTime } from 'luxon';
import { titleAt } from '../awards.js';
import { byWeek, daysPerWeek, type DayPoint, type GroupSummary, type PeriodKind } from '../summary.js';
import { dateSpan } from '../time.js';
import { columns, dayClock, dotRows, growthArea, meter, peakHour, rows, segmented, shareLine, tile, type Bar, type Point } from './blocks.js';
import { C, GAP, M, PAD, W, card, document, hoursNumber, inner, int, legend, line, lotus, plural, text, textWidth, type Box, type Delta } from './svg.js';

const WORDS: Record<PeriodKind, { kicker: string; joys: string; prev: string; before: string; perfect: string }> = {
  week: { kicker: 'ИТОГИ НЕДЕЛИ', joys: 'Радости недели', prev: 'к прошлой неделе', before: 'прошлая неделя', perfect: 'все сессии недели' },
  month: { kicker: 'ИТОГИ МЕСЯЦА', joys: 'Радости месяца', prev: 'к прошлому месяцу', before: 'прошлый месяц', perfect: 'все сессии месяца' },
  year: { kicker: 'ИТОГИ ГОДА', joys: 'Радости года', prev: 'к прошлому году', before: 'прошлый год', perfect: 'все сессии года' },
};

/** Round totals the group walks toward. */
const MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

const people = (count: number) => `${count} ${plural(count, 'человек', 'человека', 'человек')}`;

/** Relative change as a pill label; a flat result reads as "как и раньше". */
function percentDelta(current: number, previous: number | undefined, suffix: string): Delta | null {
  if (!previous) return null;
  const change = Math.round((100 * (current - previous)) / previous);
  if (change === 0) return { label: 'как и раньше', up: false };
  return { label: `${change > 0 ? '+' : '−'}${Math.abs(change)}% ${suffix}`, up: change > 0 };
}

function pointsDelta(current: number, previous: number | null, suffix: string, unit: string): Delta | null {
  if (previous === null) return null;
  const change = Math.round(current - previous);
  if (change === 0) return { label: 'как и раньше', up: false };
  return { label: `${change > 0 ? '+' : '−'}${Math.abs(change)}${unit} ${suffix}`, up: change > 0 };
}

const share = (d: { sessions: number; possible: number }) => (d.possible > 0 ? d.sessions / d.possible : null);

const dt = (date: string) => DateTime.fromISO(date).setLocale('ru');

/** Daily points for short periods, weekly buckets for long ones, with axis labels. */
function series(s: GroupSummary): { points: DayPoint[]; labels: string[]; subs?: string[] } {
  if (s.days.length <= 10) {
    return { points: s.days, labels: s.days.map((d) => dt(d.date).toFormat('ccc')), subs: s.days.map((d) => dt(d.date).toFormat('d.MM')) };
  }
  if (s.days.length <= 45) {
    return { points: s.days, labels: s.days.map((d, i) => (i % 3 === 0 ? dt(d.date).toFormat('d.MM') : '')) };
  }
  const weeks = byWeek(s.days);
  let month = '';
  const labels = weeks.map((w) => {
    const name = dt(w.date).toFormat('LLL').replace('.', '');
    if (name === month) return '';
    month = name;
    return name;
  });
  // A partial first week would put two month names side by side.
  if (labels[1] || labels[2]) labels[0] = '';
  return { points: weeks, labels };
}

/** Renders the group dashboard as SVG. */
export function groupDashboard(s: GroupSummary, chatTitle: string): string {
  const words = WORDS[s.period.kind];
  const body: string[] = [];
  const full = W - 2 * M;
  const half = (full - GAP) / 2;
  let y = M - 8;

  // Header
  body.push(`<circle cx="${W - 150}" cy="40" r="230" fill="none" stroke="${C.border}" stroke-width="2"/>`);
  body.push(`<circle cx="${W - 150}" cy="40" r="150" fill="none" stroke="${C.border}" stroke-width="2"/>`);
  body.push(lotus(M + 44, y + 108, 1.25));
  body.push(text(M + 122, y + 44, words.kicker, { size: 24, weight: 700, fill: C.accent, spacing: 3 }));
  body.push(text(M + 120, y + 104, dateSpan(s.period.from, s.period.to), { size: 60, weight: 800 }));
  body.push(text(M + 122, y + 144, chatTitle, { size: 25, fill: C.ink2 }));
  y += 178;

  // Headline: hours together, then sessions, regularity and people.
  const rowA = 296;
  const hero: Box = { x: M, y, w: 548, h: rowA };
  const regularity = share(s.totals);
  body.push(
    tile(hero, {
      label: 'Часов практики вместе',
      value: hoursNumber(s.totals.minutes),
      note: `с первого дня группы — ${hoursNumber(s.totalMinutes)} ч`,
      delta: percentDelta(s.totals.minutes, s.prev?.minutes, words.prev),
    }, 104),
  );
  const tileW = (full - hero.w - 3 * GAP) / 3;
  const tiles = [
    { label: 'Сессий', value: int(s.totals.sessions), note: `из ${int(s.totals.possible)} возможных`, delta: percentDelta(s.totals.sessions, s.prev?.sessions, '') },
    {
      label: 'Регулярность',
      value: regularity === null ? '—' : `${Math.round(regularity * 100)}%`,
      note: 'от возможных сессий',
      delta: regularity === null ? null : pointsDelta(regularity * 100, s.prev ? (100 * s.prev.sessions) / s.prev.possible : null, '', ' п.п.'),
    },
    {
      label: 'Практиковали',
      value: String(s.totals.people),
      note: `${plural(s.totals.people, 'человек', 'человека', 'человек')} хотя бы раз`,
      delta: pointsDelta(s.totals.people, s.prev?.people ?? null, '', ''),
    },
  ];
  tiles.forEach((t, i) => {
    const delta = t.delta && { ...t.delta, label: t.delta.label.trim() };
    body.push(tile({ x: hero.x + hero.w + GAP + i * (tileW + GAP), y, w: tileW, h: rowA }, { ...t, delta }));
  });
  y += rowA + GAP;

  // Day by day, and the group's growing total.
  const rowB = 450;
  const { points, labels, subs } = series(s);
  const daily: Box = { x: M, y, w: 968, h: rowB };
  const top = Math.max(...points.map((p) => p.morning + p.evening));
  const bars: Bar[] = points.map((p, i) => {
    const total = p.morning + p.evening;
    const labelled = points.length <= 10 ? total > 0 : total === top && total > 0;
    return { label: labels[i], sub: subs?.[i], a: p.morning / 60, b: p.evening / 60, value: labelled ? hoursNumber(total) : undefined };
  });
  body.push(card(daily, points === s.days ? 'День за днём' : 'Неделя за неделей', 'часы практики всей группы'));
  body.push(legend(daily.x + daily.w - PAD, daily.y + 60, [{ color: C.morning, label: 'утро' }, { color: C.evening, label: 'вечер' }]));
  body.push(columns(inner(daily, 112), bars, (v) => String(Number(v.toFixed(1))).replace('.', ',')));

  const path: Box = { x: daily.x + daily.w + GAP, y, w: full - daily.w - GAP, h: rowB };
  const before = s.totalMinutes - s.totals.minutes;
  let running = before;
  const cumulative = [before, ...s.days.map((d) => (running += d.morning + d.evening))].map((m) => m / 60);
  const totalHours = s.totalMinutes / 60;
  const goal = MILESTONES.find((m) => m > totalHours);
  body.push(card(path, 'Путь группы', 'все часы практики с первого дня'));
  body.push(text(path.x + PAD, path.y + 176, `${hoursNumber(s.totalMinutes)} ч`, { size: 64, weight: 800 }));
  body.push(growthArea({ x: path.x + PAD, y: path.y + 204, w: path.w - 2 * PAD, h: goal ? 122 : 200 }, cumulative));
  if (goal) {
    const from = MILESTONES[MILESTONES.indexOf(goal) - 1] ?? 0;
    body.push(text(path.x + PAD, path.y + rowB - 74, `До ${int(goal)} часов — ещё ${hoursNumber(goal * 60 - s.totalMinutes)} ч`, { size: 22, fill: C.ink2 }));
    body.push(meter(path.x + PAD, path.y + rowB - 54, path.w - 2 * PAD, (totalHours - from) / (goal - from)));
  }
  y += rowB + GAP;

  // Regularity over the period, and when the group checks in.
  const rowC = 390;
  const reg: Box = { x: M, y, w: half, h: rowC };
  const best = Math.max(...points.map((p) => share(p) ?? 0));
  const regPoints: Point[] = points.map((p, i) => {
    const value = share(p);
    const mark = value !== null && (points.length <= 8 || i === points.length - 1 || value === best);
    return { label: labels[i], value, mark: mark ? `${Math.round(value! * 100)}%` : undefined };
  });
  // In dense series only the best point and the last one keep their labels.
  if (points.length > 8) {
    const firstBest = regPoints.findIndex((p) => p.value === best);
    regPoints.forEach((p, i) => {
      if (i !== firstBest && i !== regPoints.length - 1) p.mark = undefined;
      if (i === regPoints.length - 1 && regPoints.length - 1 - firstBest < 3 && firstBest !== i) p.mark = undefined;
    });
  }
  const prevShare = s.prev ? s.prev.sessions / s.prev.possible : null;
  body.push(card(reg, 'Регулярность', 'доля сделанных сессий из возможных'));
  if (prevShare !== null) {
    const label = `${words.before}: ${Math.round(prevShare * 100)}%`;
    body.push(text(reg.x + reg.w - PAD, reg.y + 60, label, { size: 21, fill: C.ink2, anchor: 'end' }));
    body.push(line(reg.x + reg.w - PAD - textWidth(label, 21) - 46, reg.y + 53, reg.x + reg.w - PAD - textWidth(label, 21) - 12, reg.y + 53, C.ink3, 2));
  }
  body.push(shareLine(inner(reg, 112), regPoints, prevShare ?? undefined));

  const clock: Box = { x: M + half + GAP, y, w: half, h: rowC };
  const peaks = [
    peakHour(s.hours.morning) && `утром чаще всего в ${peakHour(s.hours.morning)} ч`,
    peakHour(s.hours.evening) && `вечером — в ${peakHour(s.hours.evening)} ч`,
  ].filter(Boolean);
  body.push(card(clock, 'Когда мы отмечаемся', peaks.join(', ') || 'отметки по часам суток'));
  body.push(legend(clock.x + clock.w - PAD, clock.y + 60, [{ color: C.morning, label: 'утро' }, { color: C.evening, label: 'вечер' }]));
  body.push(dayClock(inner(clock, 120), s.hours, 4));
  y += rowC + GAP;

  // People, generalized: how many days a week we practice, and what there is to be glad about.
  const rowD = 400;
  const rhythm: Box = { x: M, y, w: half, h: rowD };
  const perWeek = s.people.filter((p) => p.sessions > 0).map(daysPerWeek);
  const buckets = [
    { label: 'каждый день', test: (d: number) => d > 6.5 },
    { label: '5–6 дней', test: (d: number) => d > 4.5 && d <= 6.5 },
    { label: '3–4 дня', test: (d: number) => d > 2.5 && d <= 4.5 },
    { label: '1–2 дня', test: (d: number) => d <= 2.5 },
  ].map((b) => {
    const count = perWeek.filter(b.test).length;
    return { label: b.label, value: count, note: people(count) };
  });
  body.push(card(rhythm, 'Ритм практики', 'сколько дней в неделю мы садимся на подушку'));
  body.push(rows(inner(rhythm, 124), buckets, 190));

  const joys: Box = { x: M + half + GAP, y, w: half, h: rowD };
  const active = s.people.filter((p) => p.activeDays > 0);
  const perfect = active.filter((p) => p.activeDays === s.days.length && p.sessions === 2 * p.activeDays).length;
  const everyDay = active.filter((p) => p.activeDays === s.days.length && p.practicedDays === p.activeDays).length;
  const grew = active.filter((p) => p.prevMinutes !== null && p.minutes > p.prevMinutes).length;
  const awards = s.people.reduce((sum, p) => sum + p.awards.length, 0) + s.groupAwards.length;
  const personDays = active.reduce((sum, p) => sum + p.activeDays, 0);
  const hourly = personDays ? Math.round(s.totals.minutes / personDays) : 0;
  // Facts worth being glad about; empty ones step aside for the next in line.
  const facts = [
    { value: perfect, label: `сделали ${words.perfect}` },
    { value: everyDay, label: 'практиковали каждый день' },
    { value: s.prev ? grew : 0, label: `прибавили ${words.prev}` },
    { value: s.streaks.week, label: 'на серии от 7 дней' },
    { value: awards, label: 'новых званий и достижений' },
    { value: hourly, label: 'минут в день на человека' },
    { value: s.streaks.month, label: 'на серии от 30 дней' },
    { value: s.durations[60], label: 'сессий длиной в целый час' },
  ]
    .filter((f) => f.value > 0)
    .slice(0, 6);
  body.push(card(joys, words.joys, 'сколько из нас — без имён'));
  const cellW = (joys.w - 2 * PAD) / 2;
  facts.forEach((f, i) => {
    const fx = joys.x + PAD + (i % 2) * cellW;
    const fy = joys.y + 166 + Math.floor(i / 2) * 94;
    body.push(text(fx, fy, int(f.value), { size: 50, weight: 800 }));
    body.push(text(fx, fy + 30, f.label, { size: 20, fill: C.ink2 }));
  });
  y += rowD + GAP;

  // How we practice, and the titles the group holds.
  const titleRows = s.titles.map((t) => ({ label: titleAt(t.level)!.name, count: t.count, fresh: t.fresh }));
  const rowE = Math.max(370, 150 + titleRows.length * 40 + (titleRows.some((t) => t.fresh) ? 44 : 0));
  const how: Box = { x: M, y, w: half, h: rowE };
  body.push(card(how, 'Как мы практикуем', 'длина сессий и время дня'));
  body.push(
    segmented(how.x + PAD, how.y + 128, how.w - 2 * PAD, [
      { label: '1 час', value: s.durations[60], color: C.teal[3] },
      { label: '30 минут', value: s.durations[30], color: C.teal[2] },
      { label: '15 минут', value: s.durations[15], color: C.teal[1] },
    ]),
  );
  body.push(
    segmented(how.x + PAD, how.y + rowE - 126, how.w - 2 * PAD, [
      { label: 'утренние сессии', value: s.slots.morning, color: C.morning },
      { label: 'вечерние сессии', value: s.slots.evening, color: C.evening },
    ]),
  );

  const ranks: Box = { x: M + half + GAP, y, w: half, h: rowE };
  body.push(card(ranks, 'Звания в группе', 'каждая точка — один из нас'));
  if (titleRows.length) {
    body.push(dotRows({ x: ranks.x + PAD, y: ranks.y + 116, w: ranks.w - 2 * PAD, h: titleRows.length * 40 }, titleRows, 230));
    if (titleRows.some((t) => t.fresh)) {
      body.push(`<circle cx="${ranks.x + PAD + 9}" cy="${ranks.y + rowE - PAD - 8}" r="9" fill="${C.accent}"/>`);
      body.push(text(ranks.x + PAD + 30, ranks.y + rowE - PAD, 'новое звание за этот период', { size: 20, fill: C.ink2 }));
    }
  } else {
    body.push(text(ranks.x + PAD, ranks.y + 160, 'Первые звания уже близко', { size: 24, fill: C.ink2 }));
  }
  y += rowE + GAP;

  // Footer
  body.push(lotus(M + 16, y + 34, 0.5, C.ink3));
  body.push(text(M + 44, y + 30, 'Daily Meditation Tracker', { size: 21, weight: 600, fill: C.ink3 }));
  body.push(text(W - M, y + 30, 'Каждая сессия — часть общего пути', { size: 21, fill: C.ink3, anchor: 'end' }));
  return document(y + 64, body);
}

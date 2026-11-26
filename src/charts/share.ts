// Share cards: small 4:5 pictures for social media with only the numbers worth showing.
// Nothing here needs explaining to an outsider — no titles, no achievements, no zeros.
import { addDays, dateRange, dayMonth, weekStart } from '../time.js';
import type { PersonalHistory } from '../summary.js';
import type { Member } from '../types.js';
import { circle, column, document, hoursNumber, int, lotus, plural, text, textWidth, type Box } from './svg.js';

/** Instagram portrait post, 4:5. */
const SW = 1080;
const SH = 1350;
const SM = 72;
const FULL = SW - 2 * SM;

/** Night-teal theme: the brand hues, turned up for a feed. */
const T = {
  top: '#1F7A6D',
  bottom: '#0E3B37',
  ink: '#FFF8EC',
  soft: '#BFDCD5',
  faint: '#7FB3A9',
  amber: '#F4B25E',
  evening: '#C9D3FF',
};

const decimal = (value: number) => String(Number(value.toFixed(1))).replace('.', ',');
/** Noun after a number that may be fractional: "1,5 дня", "2 дня", "5 дней". */
const noun = (value: string, one: string, few: string, many: string) =>
  value.includes(',') ? few : plural(Number(value.replace(/\D/g, '')), one, few, many);

/** One number worth sharing. */
export interface Fact {
  id: string;
  value: string;
  unit?: string;
  label: string;
  /** How much the fact says about this person; the strongest ones are shown. */
  score: number;
}

interface Candidate extends Omit<Fact, 'score'> {
  /** The measured amount, the least worth showing and the amount that is already remarkable. */
  amount: number;
  min: number;
  great: number;
  weight: number;
}

/**
 * Picks what is interesting about this member's practice. Every candidate has a threshold below
 * which it stays hidden, so a newcomer and a veteran both get a card that flatters them honestly.
 */
export function shareFacts(m: Member, h: PersonalHistory): Fact[] {
  const dayMinutes = [...h.days.values()].map((d) => (d.morning ?? 0) + (d.evening ?? 0));
  const average = m.sessions > 0 ? m.minutes / m.sessions : 0;
  const regularity = h.windows.all.possible >= 14 ? h.windows.all.sessions / h.windows.all.possible : 0;
  const weeks = h.weeks.filter((w) => w.sessions > 0);
  const bestWeek = weeks.length > 1 ? Math.max(...weeks.map((w) => w.morning + w.evening)) : 0;
  const twoHourDays = dayMinutes.filter((minutes) => minutes >= 120).length;
  const days = (count: number) => plural(count, 'день', 'дня', 'дней');

  const candidates: Candidate[] = [
    { id: 'streak', value: int(m.currentStreak), unit: days(m.currentStreak), label: 'подряд без пропусков', amount: m.currentStreak, min: 3, great: 30, weight: 10 },
    { id: 'average', value: String(Math.round(average)), unit: 'мин', label: 'в среднем за сессию', amount: m.sessions >= 3 ? average : 0, min: 30, great: 60, weight: 9 },
    { id: 'hours', value: int(h.durations[60]), label: plural(h.durations[60], 'часовая сессия', 'часовых сессии', 'часовых сессий'), amount: h.durations[60], min: 3, great: 60, weight: 9 },
    { id: 'regularity', value: `${Math.round(regularity * 100)}%`, label: 'регулярность', amount: regularity, min: 0.7, great: 1, weight: 8 },
    { id: 'twoHours', value: int(twoHourDays), unit: days(twoHourDays), label: 'по два часа практики', amount: twoHourDays, min: 3, great: 30, weight: 8 },
    { id: 'full', value: int(m.fullDays), unit: days(m.fullDays), label: 'и утром, и вечером', amount: m.fullDays, min: 3, great: 40, weight: 7 },
    { id: 'record', value: int(m.bestStreak), unit: days(m.bestStreak), label: 'самая длинная серия', amount: m.bestStreak > m.currentStreak ? m.bestStreak : 0, min: 7, great: 60, weight: 6 },
    { id: 'bestWeek', value: hoursNumber(bestWeek), unit: 'ч', label: 'за лучшую неделю', amount: bestWeek / 60, min: 5, great: 14, weight: 6 },
    { id: 'sessions', value: int(m.sessions), label: plural(m.sessions, 'сессия', 'сессии', 'сессий'), amount: m.sessions, min: 2, great: 300, weight: 5 },
    { id: 'days', value: int(m.practicedDays), unit: days(m.practicedDays), label: 'с практикой', amount: m.practicedDays, min: 2, great: 200, weight: 5 },
  ];
  return candidates
    .filter((c) => c.amount >= c.min)
    .map(({ amount, min, great, weight, ...fact }) => ({
      ...fact,
      score: weight * (0.5 + 0.5 * Math.min((amount - min) / Math.max(great - min, 1e-9), 1)),
    }))
    .sort((a, b) => b.score - a.score);
}

const glass = (box: Box, r = 36) =>
  `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${r}" fill="#FFFFFF" fill-opacity="0.09"/>`;

/** Background, header with the name and the footer every share card has. */
function frame(m: Member, body: string[]): string {
  const background = [
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${T.top}"/><stop offset="1" stop-color="${T.bottom}"/></linearGradient></defs>`,
    `<rect width="${SW}" height="${SH}" fill="url(#bg)"/>`,
    ...[330, 230, 130].map((r) => `<circle cx="${SW - 90}" cy="70" r="${r}" fill="none" stroke="#FFFFFF" stroke-opacity="0.07" stroke-width="2"/>`),
  ];
  const header = [
    lotus(SM + 36, SM + 78, 1.05, T.amber),
    text(SM + 98, SM + 30, 'МОЯ ПРАКТИКА', { size: 21, weight: 700, fill: T.amber, spacing: 3 }),
    text(SM + 96, SM + 78, m.firstName, { size: 46, weight: 800, fill: T.ink }),
  ];
  const footer = [
    lotus(SM + 14, SH - SM + 14, 0.42, T.faint),
    text(SM + 38, SH - SM + 10, 'Daily Meditation Tracker', { size: 20, weight: 600, fill: T.faint }),
    text(SW - SM, SH - SM + 10, 'випассана · каждый день', { size: 20, fill: T.faint, anchor: 'end' }),
  ];
  return document(SH, [...background, ...header, ...body, ...footer], SW, T.bottom);
}

/** One huge number with its unit on the next line. */
function hero(y: number, value: string, caption: string, note?: string): string {
  const size = Math.min(280, (FULL / textWidth(value, 100, 800)) * 100);
  const parts = [
    text(SM - 8, y, value, { size, weight: 800, fill: T.ink }),
    text(SM, y + 72, caption, { size: 46, weight: 700, fill: T.ink }),
  ];
  if (note) parts.push(text(SM, y + 118, note, { size: 26, fill: T.soft }));
  return parts.join('');
}

function factTile(box: Box, fact: Fact): string {
  const size = 78;
  const x = box.x + 34;
  const baseline = box.y + box.h / 2 + 16;
  const parts = [glass(box), text(x, baseline, fact.value, { size, weight: 800, fill: T.ink })];
  if (fact.unit) parts.push(text(x + textWidth(fact.value, size, 800) + 12, baseline, fact.unit, { size: 32, weight: 700, fill: T.soft }));
  parts.push(text(x, baseline + 42, fact.label, { size: 24, fill: T.soft }));
  return parts.join('');
}

const TILE_H = 170;
const TILE_GAP = 20;

/** Up to four facts as tiles: one row for two, a wide one on top for three. Returns the SVG and the height taken. */
function factTiles(y: number, facts: Fact[]): { svg: string; height: number } {
  const rows = facts.length <= 2 ? [facts] : facts.length === 3 ? [facts.slice(0, 1), facts.slice(1)] : [facts.slice(0, 2), facts.slice(2, 4)];
  const svg = rows.flatMap((row, r) => {
    const w = (FULL - TILE_GAP * (row.length - 1)) / row.length;
    return row.map((fact, i) => factTile({ x: SM + i * (w + TILE_GAP), y: y + r * (TILE_H + TILE_GAP), w, h: TILE_H }, fact));
  });
  const filled = rows.filter((row) => row.length).length;
  return { svg: svg.join(''), height: filled * TILE_H + Math.max(filled - 1, 0) * TILE_GAP };
}

const minutesOf = (h: PersonalHistory, date: string) => ({ morning: h.days.get(date)?.morning ?? 0, evening: h.days.get(date)?.evening ?? 0 });

/** The last 30 days as columns: morning below, evening above. */
function recentDays(box: Box, h: PersonalHistory): string {
  const first = [h.from, addDays(h.to, -29)].sort().at(-1)!;
  const dates = dateRange(first, h.to);
  const slots = Math.max(dates.length, 14);
  const pad = 34;
  const plot = { x: box.x + pad, y: box.y + 84, w: box.w - 2 * pad, h: box.h - 84 - 34 };
  const band = plot.w / slots;
  const width = Math.min(band * 0.62, 30);
  const base = plot.y + plot.h;
  const max = Math.max(...dates.map((d) => minutesOf(h, d).morning + minutesOf(h, d).evening), 60);
  const parts = [
    glass(box),
    text(box.x + pad, box.y + 52, dates.length >= 30 ? 'последние 30 дней' : `день за днём с ${dayMonth(first)}`, { size: 24, weight: 600, fill: T.soft }),
  ];
  let lx = box.x + box.w - pad;
  for (const key of [{ color: T.evening, label: 'вечер' }, { color: T.amber, label: 'утро' }]) {
    lx -= textWidth(key.label, 22);
    parts.push(text(lx, box.y + 52, key.label, { size: 22, fill: T.soft }));
    parts.push(circle(lx - 16, box.y + 45, 7, key.color));
    lx -= 50;
  }
  dates.forEach((date, i) => {
    const x = plot.x + band * i + (band - width) / 2;
    const { morning, evening } = minutesOf(h, date);
    const hA = (morning / max) * plot.h;
    const hB = (evening / max) * plot.h;
    if (morning + evening === 0) return parts.push(circle(x + width / 2, base - 4, 4, T.faint));
    if (hA > 0) parts.push(column(x, base - hA, width, hA, hB > 0 ? 0 : 8, T.amber));
    if (hB > 0) parts.push(column(x, base - hA - (hA > 0 ? 3 : 0) - hB, width, hB, 8, T.evening));
  });
  return parts.join('');
}

/** Heat steps by minutes in a day, as opacities of one warm hue. */
const HEAT = [
  { upTo: 30, opacity: 0.3 },
  { upTo: 60, opacity: 0.52 },
  { upTo: 90, opacity: 0.76 },
  { upTo: Infinity, opacity: 1 },
];

/** Calendar of the last weeks: a column per week, Monday on top. */
function calendar(box: Box, h: PersonalHistory): string {
  const lastWeek = weekStart(h.to);
  const span = Math.round(dateRange(weekStart(h.from), lastWeek).length / 7) + 1;
  const weeks = Math.min(Math.max(span, 8), 20);
  const pad = 34;
  const head = 84;
  const pitch = Math.min((box.w - 2 * pad) / weeks, (box.h - head - pad) / 7);
  const size = pitch * 0.82;
  const x0 = box.x + (box.w - weeks * pitch + (pitch - size)) / 2;
  const y0 = box.y + head + (box.h - head - pad - 7 * pitch) / 2;
  const parts = [glass(box), text(box.x + pad, box.y + 52, 'каждый квадрат — день практики', { size: 24, weight: 600, fill: T.soft })];
  dateRange(addDays(lastWeek, -7 * (weeks - 1)), addDays(lastWeek, 6)).forEach((date, index) => {
    if (date > h.to) return;
    const day = minutesOf(h, date);
    const minutes = day.morning + day.evening;
    const fill = minutes > 0 ? T.amber : '#FFFFFF';
    const opacity = minutes > 0 ? HEAT.find((s) => minutes <= s.upTo)!.opacity : date < h.from ? 0.04 : 0.1;
    parts.push(
      `<rect x="${(x0 + Math.floor(index / 7) * pitch).toFixed(1)}" y="${(y0 + (index % 7) * pitch).toFixed(1)}" width="${size.toFixed(1)}" height="${size.toFixed(1)}" rx="${(size * 0.26).toFixed(1)}" fill="${fill}" fill-opacity="${opacity}"/>`,
    );
  });
  return parts.join('');
}

/** What the total time compares to: days of a 10-day course, which has about ten hours of sitting a day. */
function courseNote(minutes: number): string | undefined {
  const hours = minutes / 60;
  if (hours < 10) return undefined;
  if (hours < 100) {
    const value = decimal(hours / 10);
    return `как ${value} ${noun(value, 'день', 'дня', 'дней')} на курсе випассаны`;
  }
  const value = decimal(hours / 100);
  return `как ${value} ${noun(value, 'десятидневный курс', 'десятидневных курса', 'десятидневных курсов')} випассаны`;
}

/** A member needs this many practiced days for the calendar card to look like something. */
const CALENDAR_DAYS = 21;
const BODY_TOP = SM + 150;
const BODY_BOTTOM = SH - SM - 50;

/**
 * Share cards of a member, as SVG: the hours with the strongest facts and the recent days, and —
 * once there is enough history — the calendar with the next facts. `member` includes today.
 */
export function shareCards(m: Member, h: PersonalHistory): string[] {
  if (m.sessions === 0) return [];
  const withCalendar = m.practicedDays >= CALENDAR_DAYS;
  // The calendar card leads with the practiced days, so they are not repeated as a fact.
  const facts = shareFacts(m, h).filter((f) => !(withCalendar && f.id === 'days'));

  const hoursValue = hoursNumber(m.minutes);
  const total =
    m.minutes >= 60
      ? hero(BODY_TOP + 250, hoursValue, `${noun(hoursValue, 'час', 'часа', 'часов')} практики`, courseNote(m.minutes) ?? `с ${dayMonth(m.joinedDate)}`)
      : hero(BODY_TOP + 250, String(m.minutes), `${plural(m.minutes, 'минута', 'минуты', 'минут')} практики`, `с ${dayMonth(m.joinedDate)}`);
  const tilesY = BODY_TOP + 250 + 160;
  const tiles = factTiles(tilesY, facts.slice(0, 4));
  const chartY = tilesY + tiles.height + (tiles.height ? 24 : 0);
  const cards = [frame(m, [total, tiles.svg, recentDays({ x: SM, y: chartY, w: FULL, h: BODY_BOTTOM - chartY }, h)])];

  if (withCalendar) {
    const days = int(m.practicedDays);
    const more = facts.slice(4, 6);
    const restY = BODY_BOTTOM - (more.length ? TILE_H : 0);
    const top = BODY_TOP + 250 + 156;
    const withUs = dateRange(m.joinedDate, h.to).length;
    cards.push(
      frame(m, [
        hero(BODY_TOP + 250, days, `${plural(m.practicedDays, 'день', 'дня', 'дней')} на подушке`, `из ${int(withUs)} с ${dayMonth(m.joinedDate)}`),
        calendar({ x: SM, y: top, w: FULL, h: restY - (more.length ? 24 : 0) - top }, h),
        factTiles(restY, more).svg,
      ]),
    );
  }
  return cards;
}

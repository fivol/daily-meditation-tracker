import { CLOCK_DAYS, CLOCK_SPREAD_MINUTES, TITLES, type Title } from './config.js';
import { regularity } from './stats.js';
import type { AwardRecord, MemberStats } from './types.js';

/** What an achievement condition sees: aggregates (closed days plus, live, today) and context. */
export interface AwardState extends MemberStats {
  /** Day being evaluated. */
  date: string;
  /** Last day the bot removed the member. */
  removedOn?: string;
}

export interface Achievement {
  id: string;
  emoji: string;
  name: string;
  /** Line under the name in the congratulation. */
  text: string;
  /** Condition shown for a locked achievement. */
  condition: string;
  secret?: boolean;
  /** Evaluated only when a day closes (needs the final 30-day window). */
  atClose?: boolean;
  earned: (s: AwardState) => boolean;
  /** Current progress for a locked achievement, e.g. "сейчас 17". */
  progress?: (s: AwardState) => string;
}

const now = (value: number) => `сейчас ${value}`;

const clockSpread = (times: number[]) => Math.max(...times) - Math.min(...times);

const activeInWindow = (s: AwardState) => s.recent.filter((d) => d.status === 'active').length;

/** Personal achievements, in the order they are listed in /me. */
export const ACHIEVEMENTS: Achievement[] = [
  // Streaks
  { id: 'streak7', emoji: '🌄', name: 'Семь рассветов', text: 'Неделя без единого пропуска', condition: 'серия 7 дней', earned: (s) => s.currentStreak >= 7, progress: (s) => now(s.currentStreak) },
  { id: 'streak30', emoji: '🌙', name: 'Лунный цикл', text: 'Месяц — каждый день на подушке', condition: 'серия 30 дней', earned: (s) => s.currentStreak >= 30, progress: (s) => now(s.currentStreak) },
  { id: 'streak100', emoji: '🏞', name: 'Сто рассветов', text: 'Сто дней подряд. Это уже образ жизни', condition: 'серия 100 дней', earned: (s) => s.currentStreak >= 100, progress: (s) => now(s.currentStreak) },
  { id: 'streak365', emoji: '🌍', name: 'Вокруг Солнца', text: 'Год без единого пропуска 🙏', condition: 'серия 365 дней', earned: (s) => s.currentStreak >= 365, progress: (s) => now(s.currentStreak) },
  // Full practice
  { id: 'retreat10', emoji: '🏕', name: 'Десятидневка', text: '10 дней подряд утром и вечером по часу. Курс на дому 🙏', condition: '10 дней подряд утро и вечер по 60 минут', earned: (s) => s.fullHourRun >= 10, progress: (s) => now(s.fullHourRun) },
  { id: 'adhitthana', emoji: '🪨', name: 'Адхиттхана', text: 'Две недели сильной решимости', condition: '14 дней подряд с сессией 60 минут', earned: (s) => s.hourRun >= 14, progress: (s) => now(s.hourRun) },
  { id: 'habit21', emoji: '☯️', name: 'Привычка', text: 'Утро и вечер — уже без усилия', condition: '21 день подряд обе сессии', earned: (s) => s.bothRun >= 21, progress: (s) => now(s.bothRun) },
  { id: 'goenka30', emoji: '👳', name: 'Как завещал Гоенка', text: 'Два часа в день, как он и просил', condition: '30 дней подряд утро и вечер по 60 минут', earned: (s) => s.fullHourRun >= 30, progress: (s) => now(s.fullHourRun) },
  // Time
  { id: 'gong', emoji: '🔔', name: 'Утренний гонг', text: 'Встаёшь раньше гонга', condition: '7 дней подряд утренняя сессия от 30 минут отмечена до 07:00', earned: (s) => s.gongRun >= 7, progress: (s) => now(s.gongRun) },
  {
    id: 'clock', emoji: '⏰', name: 'Швейцарские часы', text: 'По тебе можно сверять время',
    condition: '14 дней подряд утренняя сессия от 30 минут, отметки в пределах одного часа',
    earned: (s) => s.morningTimes.length >= CLOCK_DAYS && clockSpread(s.morningTimes.slice(-CLOCK_DAYS)) <= CLOCK_SPREAD_MINUTES,
    progress: (s) => now(s.morningTimes.length),
  },
  { id: 'noReminder', emoji: '🔕', name: 'Без напоминаний', text: 'Месяц бот ни разу тебя не звал', condition: '30 дней подряд первая сессия отмечена до напоминания', earned: (s) => s.noReminderRun >= 30, progress: (s) => now(s.noReminderRun) },
  // Character
  { id: 'firstStep', emoji: '🧘', name: 'Первый шаг', text: 'Путь в тысячу часов начинается с одной отметки', condition: 'первая сессия', earned: (s) => s.sessions >= 1 },
  { id: 'phoenix', emoji: '🐦‍🔥', name: 'Феникс', text: 'Вернуться труднее, чем начать', condition: 'вернуться после исключения и набрать серию 7 дней', earned: (s) => Boolean(s.removedOn && s.date > s.removedOn) && s.currentStreak >= 7 },
  { id: 'newHeight', emoji: '🧗', name: 'Новая высота', text: 'Свой рекорд побит', condition: 'после оборвавшейся серии от 14 дней побить свой рекорд', earned: (s) => s.brokenBest >= 14 && s.currentStreak > s.brokenBest },
  {
    id: 'flint', emoji: '🗿', name: 'Кремень', text: '90% за месяц', condition: 'регулярность за 30 дней от 90% (не меньше 25 активных дней)', atClose: true,
    earned: (s) => activeInWindow(s) >= 25 && regularity(s) >= 0.9,
    progress: (s) => `сейчас ${Math.round(regularity(s) * 100)}%`,
  },
  { id: 'backpack', emoji: '🎒', name: 'Дхамма в рюкзаке', text: 'Практика не уходит в отпуск', condition: '5 сессий во время паузы', earned: (s) => s.pausedSessions >= 5, progress: (s) => now(s.pausedSessions) },
  { id: 'yearTotal', emoji: '🗓', name: 'Год на подушке', text: '365 дней с практикой', condition: '365 дней с практикой в сумме', earned: (s) => s.practicedDays >= 365, progress: (s) => now(s.practicedDays) },
  // Secret
  { id: 'owl', emoji: '🦉', name: 'Сова', text: 'Успеваешь до закрытия дня', condition: '5 раз вечерняя сессия отмечена после полуночи', secret: true, earned: (s) => s.owlCount >= 5 },
  { id: 'savedDay', emoji: '🛟', name: 'Спасённый день', text: 'Сказал «не получилось» — и всё-таки сел', condition: '5 раз «не получилось» сменено на сессию', secret: true, earned: (s) => s.rescuedCount >= 5 },
];

const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export const achievementById = (id: string) => ACHIEVEMENT_BY_ID.get(id);

// Titles live in the same awards map as `title:<level>`, level being 1-based.
export const titleAwardId = (level: number) => `title:${level}`;

export function titleLevelOf(id: string): number | null {
  return id.startsWith('title:') ? Number(id.slice(6)) : null;
}

export const titleAt = (level: number): Title | undefined => TITLES[level - 1];

/** Level of the highest title whose threshold the given minutes reach (0 = none). */
export function titleLevelFor(minutes: number): number {
  return TITLES.filter((t) => minutes / 60 >= t.hours).length;
}

/** Highest title level among granted awards (0 = none). */
export function maxTitle(awards: Record<string, AwardRecord>): number {
  return Math.max(0, ...Object.keys(awards).map((id) => titleLevelOf(id) ?? 0));
}

/** Ids of every title and achievement the state qualifies for. */
export function earnedAwards(state: AwardState, atClose: boolean): Set<string> {
  const result = new Set<string>();
  for (const a of ACHIEVEMENTS) if ((atClose || !a.atClose) && a.earned(state)) result.add(a.id);
  for (let level = 1; level <= titleLevelFor(state.minutes); level++) result.add(titleAwardId(level));
  return result;
}

/** Number of personal achievements (titles excluded) among granted awards. */
export function achievementCount(awards: Record<string, AwardRecord> | undefined): number {
  return Object.keys(awards ?? {}).filter((id) => ACHIEVEMENT_BY_ID.has(id)).length;
}

export interface GroupAward {
  id: string;
  emoji: string;
  name: string;
}

/** Group achievements, granted to the whole chat once, at day close. */
export const GROUP_AWARDS: GroupAward[] = [
  { id: 'fullHouse', emoji: '🙌', name: 'Сангха в сборе' },
  { id: 'noLossWeek', emoji: '🤝', name: 'Неделя без потерь' },
  { id: 'hours1000', emoji: '⏳', name: '1 000 часов группы' },
  { id: 'hours5000', emoji: '⏳', name: '5 000 часов группы' },
  { id: 'hours10000', emoji: '⏳', name: '10 000 часов группы' },
];

export const GROUP_HOURS = [
  { id: 'hours1000', hours: 1000 },
  { id: 'hours5000', hours: 5000 },
  { id: 'hours10000', hours: 10000 },
];

/** Input for the group achievements of one closed day. */
export interface GroupDay {
  /** Sessions per member who was active that day. */
  activeSessions: number[];
  /** Closed days in a row without a missed day, including this one. */
  noLossRun: number;
  totalMinutes: number;
}

export function earnedGroupAwards(day: GroupDay): string[] {
  const result: string[] = [];
  if (day.activeSessions.length >= 5 && day.activeSessions.every((n) => n === 2)) result.push('fullHouse');
  if (day.noLossRun >= 7) result.push('noLossWeek');
  for (const h of GROUP_HOURS) if (day.totalMinutes / 60 >= h.hours) result.push(h.id);
  return result;
}

/** Updates the group's no-loss run with one closed day. */
export function nextNoLossRun(current: number, activeSessions: number[]): number {
  if (activeSessions.length === 0) return current;
  return activeSessions.every((n) => n > 0) ? current + 1 : 0;
}

// Deterministic made-up history for `npm run preview`: a group of 24, by default over 14 months.
import { applyDay, emptyStats, type DaySessions } from '../src/stats.js';
import { titleLevelFor } from '../src/awards.js';
import { addDays, dateRange, weekday } from '../src/time.js';
import type { ChatSettings, Checkin, DayStatus, Member, Minutes } from '../src/types.js';

const NAMES = ['Аня', 'Боря', 'Вера', 'Гоша', 'Даша', 'Женя', 'Зоя', 'Илья', 'Катя', 'Лёша', 'Маша', 'Никита', 'Оля', 'Паша', 'Рита', 'Саша', 'Таня', 'Уля', 'Федя', 'Юра', 'Яна', 'Тимур', 'Лена', 'Марк'];

/** Small seeded generator so every preview looks the same. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

export function demoHistory(historyDays = 427) {
  const rand = random(7);
  const today = '2028-01-17';
  const settings: ChatSettings = {
    timezone: 'Europe/Moscow',
    dayBoundaryHour: 4,
    schedule: { morning: '04:00', evening: '16:00', reminder: '21:30' },
    missLimit: 3,
    maxPauseDays: 21,
    startDate: addDays(today, -historyDays),
    lastClosedDate: addDays(today, -1),
    awards: { fullHouse: '2028-01-12' },
  };
  const dates = dateRange(settings.startDate, settings.lastClosedDate);
  const statuses = new Map<string, Record<string, DayStatus>>(dates.map((d) => [d, {}]));
  const checkins: Checkin[] = [];

  const members = NAMES.map((firstName, index): Member => {
    const userId = 1000 + index;
    const joinedDate = addDays(settings.startDate, index < 9 ? 0 : Math.floor(rand() * historyDays * 0.9));
    const diligence = 0.62 + rand() * 0.36;
    const hour = 5 + Math.floor(rand() * 5);
    let stats = emptyStats();
    const awards: Member['awards'] = {};
    let level = 0;
    for (const [i, date] of dates.entries()) {
      if (date < joinedDate) continue;
      const growth = Math.min(0.1, i / 4000);
      const weekend = weekday(date) >= 6 ? -0.08 : 0;
      const done: DaySessions = {};
      for (const slot of ['morning', 'evening'] as const) {
        if (rand() > diligence + growth + weekend - (slot === 'evening' ? 0.07 : 0)) continue;
        const roll = rand();
        const minutes: Minutes = roll < 0.62 + growth ? 60 : roll < 0.9 ? 30 : 15;
        const at = `${slot === 'morning' ? date : rand() < 0.08 ? addDays(date, 1) : date}T${String(slot === 'morning' ? hour + Math.floor(rand() * 3) - 3 : rand() < 0.08 ? 21 : 15 + Math.floor(rand() * 6)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00.000Z`;
        done[slot] = { minutes, at, source: 'poll', rescued: false };
        checkins.push({ userId, date, slot, status: 'done', minutes, firstAt: at, updatedAt: at, source: 'poll' });
      }
      statuses.get(date)![userId] = 'active';
      stats = applyDay(stats, date, 'active', done, settings);
      const reached = titleLevelFor(stats.minutes);
      if (reached > level) {
        level = reached;
        awards[`title:${level}`] = { date };
      }
      if (stats.currentStreak === 7 && !awards.streak7) awards.streak7 = { date };
      if (stats.currentStreak === 30 && !awards.streak30) awards.streak30 = { date };
    }
    return { ...stats, userId, firstName, joinedDate, status: 'active', title: level || undefined, awards };
  });
  return { members, statuses, checkins, settings, today };
}

import type { ChatSettings } from './types.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}

export const env = {
  /** Read on first use, so scripts that never talk to Telegram can run without it. */
  get botToken() {
    return required('BOT_TOKEN');
  },
  ownerId: process.env.OWNER_ID ? Number(process.env.OWNER_ID) : undefined,
};

/** Defaults applied to a chat on /setup. */
export const DEFAULT_SETTINGS: Omit<ChatSettings, 'startDate'> = {
  timezone: 'Europe/Moscow',
  dayBoundaryHour: 4,
  schedule: { morning: '04:00', evening: '16:00', reminder: '21:30' },
  missLimit: 3,
  maxPauseDays: 21,
};

export const RECENT_DAYS = 30;

export interface Title {
  emoji: string;
  name: string;
  /** Genitive, for "до 🧡 Монаха". */
  genitive: string;
  hours: number;
  line: string;
}

/** Titles in ascending order; a member holds the highest one whose threshold they reached. */
export const TITLES: Title[] = [
  { emoji: '🌱', name: 'Искатель', genitive: 'Искателя', hours: 2, line: 'Первые два часа на подушке' },
  { emoji: '📖', name: 'Ученик', genitive: 'Ученика', hours: 5, line: 'Путь начался' },
  { emoji: '🐣', name: 'Падаван', genitive: 'Падавана', hours: 10, line: 'Сила пробуждается' },
  { emoji: '📿', name: 'Послушник', genitive: 'Послушника', hours: 30, line: 'Подушка уже узнаёт тебя' },
  { emoji: '🌿', name: 'Практик', genitive: 'Практика', hours: 60, line: 'Месяц практики за плечами' },
  { emoji: '🎒', name: 'Старый студент', genitive: 'Старого студента', hours: 100, line: 'Столько же длится 10-дневный курс' },
  { emoji: '🧡', name: 'Монах', genitive: 'Монаха', hours: 200, line: 'Два курса, не выходя из дома' },
  { emoji: '🏔', name: 'Отшельник', genitive: 'Отшельника', hours: 350, line: 'Полгода утром и вечером' },
  { emoji: '🧙', name: 'Мастер', genitive: 'Мастера', hours: 500, line: 'Падаван вырос' },
  { emoji: '🥋', name: 'Сенсей', genitive: 'Сенсея', hours: 750, line: 'Год практики. Есть чему научить' },
  { emoji: '🕉', name: 'Йог', genitive: 'Йога', hours: 1000, line: 'Тысяча часов тишины' },
  { emoji: '🙏', name: 'Гуру', genitive: 'Гуру', hours: 1500, line: 'За советом теперь идут к тебе' },
  { emoji: '👳', name: 'Гоенка', genitive: 'Гоенки', hours: 2000, line: 'Будь счастлив!' },
  { emoji: '🪷', name: 'Бодхисаттва', genitive: 'Бодхисаттвы', hours: 3000, line: 'Осталось чуть-чуть' },
  { emoji: '☸️', name: 'Будда', genitive: 'Будды', hours: 3650, line: 'Пять лет по два часа каждый день' },
];

/** Local times used by the time-based achievements. */
export const GONG_BEFORE = '07:00';
export const OWL_AFTER = '00:00';
export const CLOCK_DAYS = 14;
export const CLOCK_SPREAD_MINUTES = 60;

import type { ChatSettings } from './types.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}

export const env = {
  botToken: required('BOT_TOKEN'),
  ownerId: process.env.OWNER_ID ? Number(process.env.OWNER_ID) : undefined,
};

/** Defaults applied to a chat on /setup. */
export const DEFAULT_SETTINGS: Omit<ChatSettings, 'startDate'> = {
  timezone: 'Europe/Moscow',
  dayBoundaryHour: 4,
  schedule: { morning: '05:00', evening: '16:00', reminder: '21:30' },
  missLimit: 3,
  maxPauseDays: 21,
  newcomerDays: 7,
};

export const STREAK_MILESTONES = [7, 14, 21, 30, 50, 100, 200, 365];
export const SESSION_MILESTONE_STEP = 100;
export const HOURS_MILESTONE_STEP = 100;
export const RECENT_DAYS = 30;

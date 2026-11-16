import { GrammyError, type Api } from 'grammy';
import { DateTime } from 'luxon';
import { days } from '../db.js';
import { log } from '../logger.js';
import { addDays, momentOf, practiceDate } from '../time.js';
import type { ChatSettings, JobName } from '../types.js';
import { listChats } from './chats.js';
import { closeDay, runEvening, runLeaderboard, runMorning, runReminder } from './jobs.js';

type Job = {
  name: JobName;
  time: (s: ChatSettings) => string;
  run: (api: Api, chatId: number, settings: ChatSettings, date: string) => Promise<void>;
  /** A job that is this late is marked done without running. */
  staleAfterHours?: number;
};

// Each job sends one thing, so a retry after a failure never re-sends what already went out.
const JOBS: Job[] = [
  { name: 'leaderboard', time: (s) => s.schedule.morning, run: runLeaderboard },
  { name: 'morning', time: (s) => s.schedule.morning, run: runMorning },
  { name: 'evening', time: (s) => s.schedule.evening, run: runEvening },
  { name: 'reminder', time: (s) => s.schedule.reminder, run: runReminder, staleAfterHours: 3 },
];

const TICK_MS = 30_000;
let running = false;

/** Telegram refused for good (bot removed, chat gone, bad request): retrying won't help. */
function isPermanent(err: unknown): boolean {
  return err instanceof GrammyError && (err.error_code === 400 || err.error_code === 403);
}

/**
 * Runs due jobs every 30 seconds. Jobs are marked in Firestore once done, so restarts don't
 * duplicate them; a failed job is retried on the next tick, and jobs missed during downtime
 * are caught up.
 */
export function startScheduler(api: Api): NodeJS.Timeout {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const { chatId, settings } of await listChats()) {
        await processChat(api, chatId, settings).catch((err) =>
          log.error(`Chat ${chatId}: scheduler failed, retrying next tick`, err),
        );
      }
    } catch (err) {
      log.error('Scheduler tick failed', err);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, TICK_MS);
}

async function processChat(api: Api, chatId: number, settings: ChatSettings) {
  const now = DateTime.now();
  const today = practiceDate(settings, now);

  // Days are closed in order; nothing of today runs until yesterday is final.
  for (let d = addDays(settings.lastClosedDate, 1); d < today; d = addDays(d, 1)) {
    await closeDay(api, chatId, settings, d);
    log.info(`Chat ${chatId}: closed ${d}`);
  }

  const dayRef = days(chatId).doc(today);
  const done = (await dayRef.get()).data()?.jobsDone ?? {};
  for (const job of JOBS) {
    if (done[job.name]) continue;
    const due = momentOf(settings, today, job.time(settings));
    if (now < due) continue;
    const stale = job.staleAfterHours !== undefined && now > due.plus({ hours: job.staleAfterHours });
    try {
      if (stale) log.warn(`Chat ${chatId}: ${job.name} for ${today} is too late, skipped`);
      else await job.run(api, chatId, settings, today);
    } catch (err) {
      if (!isPermanent(err)) throw err;
      log.error(`Chat ${chatId}: ${job.name} for ${today} refused by Telegram, skipped`, err);
    }
    await dayRef.set({ jobsDone: { [job.name]: true } }, { merge: true });
    if (!stale) log.info(`Chat ${chatId}: ${job.name} for ${today} done`);
  }
}

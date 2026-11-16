import type { Api } from 'grammy';
import { DateTime } from 'luxon';
import { days } from '../db.js';
import { addDays, momentOf, practiceDate } from '../time.js';
import type { ChatSettings, JobName } from '../types.js';
import { listChats } from './chats.js';
import { closeDay, runEvening, runMorning, runReminder } from './jobs.js';

type Job = {
  name: Exclude<JobName, 'close'>;
  time: (s: ChatSettings) => string;
  run: (api: Api, chatId: number, settings: ChatSettings, date: string) => Promise<void>;
  /** A job that is this late is marked done without running. */
  staleAfterHours?: number;
};

const JOBS: Job[] = [
  { name: 'morning', time: (s) => s.schedule.morning, run: runMorning },
  { name: 'evening', time: (s) => s.schedule.evening, run: runEvening },
  { name: 'reminder', time: (s) => s.schedule.reminder, run: runReminder, staleAfterHours: 3 },
];

const TICK_MS = 30_000;
let running = false;

/**
 * Runs due jobs every 30 seconds. Jobs are marked in Firestore once done, so restarts don't
 * duplicate them, and jobs missed during downtime are caught up.
 */
export function startScheduler(api: Api): NodeJS.Timeout {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const { chatId, settings } of await listChats()) {
        await processChat(api, chatId, settings).catch((err) => console.error(`Chat ${chatId}: job failed`, err));
      }
    } catch (err) {
      console.error('Scheduler tick failed', err);
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

  for (let d = addDays(settings.lastClosedDate, 1); d < today; d = addDays(d, 1)) {
    await closeDay(api, chatId, settings, d);
  }

  const dayRef = days(chatId).doc(today);
  const done = (await dayRef.get()).data()?.jobsDone ?? {};
  for (const job of JOBS) {
    if (done[job.name]) continue;
    const due = momentOf(settings, today, job.time(settings));
    if (now < due) continue;
    const stale = job.staleAfterHours !== undefined && now > due.plus({ hours: job.staleAfterHours });
    if (!stale) await job.run(api, chatId, settings, today);
    await dayRef.set({ jobsDone: { [job.name]: true } }, { merge: true });
  }
}

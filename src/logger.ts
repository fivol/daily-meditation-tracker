import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';

const LOG_DIR = process.env.LOG_DIR ?? 'logs';
const KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

let currentFile = '';

function fileFor(now: Date): string {
  const name = `bot-${now.toISOString().slice(0, 10)}.log`;
  if (name !== currentFile) {
    currentFile = name;
    pruneOldFiles(now);
  }
  return join(LOG_DIR, name);
}

function pruneOldFiles(now: Date): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const cutoff = new Date(now.getTime() - KEEP_DAYS * DAY_MS).toISOString().slice(0, 10);
    for (const file of readdirSync(LOG_DIR)) {
      const date = file.match(/^bot-(\d{4}-\d{2}-\d{2})\.log$/)?.[1];
      if (date && date < cutoff) unlinkSync(join(LOG_DIR, file));
    }
  } catch (err) {
    console.error('Log rotation failed', err);
  }
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string, details: unknown[]): void {
  const now = new Date();
  const extra = details.map((d) => (typeof d === 'string' ? d : inspect(d, { depth: 4, breakLength: Infinity })));
  const line = [now.toISOString(), level, message, ...extra].join(' ');
  (level === 'INFO' ? console.log : console.error)(line);
  try {
    appendFileSync(fileFor(now), line + '\n');
  } catch (err) {
    console.error('Writing the log file failed', err);
  }
}

/** Timestamped logs to stdout and to a daily file in LOG_DIR (kept for 30 days). */
export const log = {
  info: (message: string, ...details: unknown[]) => write('INFO', message, details),
  warn: (message: string, ...details: unknown[]) => write('WARN', message, details),
  error: (message: string, ...details: unknown[]) => write('ERROR', message, details),
};

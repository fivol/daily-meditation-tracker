import type { Api } from 'grammy';
import { renderProgress } from '../render.js';
import { practiceDate } from '../time.js';
import { SLOTS, type Slot } from '../types.js';
import { getChat } from './chats.js';
import { checkinsOfDay } from './checkins.js';
import { listMembers } from './members.js';

const DEBOUNCE_MS = 3000;
const pending = new Map<number, NodeJS.Timeout>();

/** Edits the pinned "today" message; bursts of votes collapse into one edit. */
export function scheduleProgressUpdate(api: Api, chatId: number): void {
  clearTimeout(pending.get(chatId));
  pending.set(
    chatId,
    setTimeout(() => {
      pending.delete(chatId);
      updateProgress(api, chatId).catch((err) => console.error('Progress update failed', err));
    }, DEBOUNCE_MS),
  );
}

export async function updateProgress(api: Api, chatId: number): Promise<void> {
  const settings = await getChat(chatId);
  if (!settings?.progressMessageId) return;
  const date = practiceDate(settings);
  const [list, all] = await Promise.all([checkinsOfDay(chatId, date), listMembers(chatId)]);
  const total = all.filter((m) => m.status === 'active' && m.joinedDate <= date).length;
  const counts = Object.fromEntries(
    SLOTS.map((slot) => [slot, list.filter((c) => c.slot === slot && c.status === 'done').length]),
  ) as Record<Slot, number>;
  try {
    await api.editMessageText(chatId, settings.progressMessageId, renderProgress(date, counts, total));
  } catch (err) {
    if (!String(err).includes('message is not modified')) throw err;
  }
}

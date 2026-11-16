import { chats } from '../db.js';
import type { ChatSettings } from '../types.js';

/** Settings of a configured chat, or null if /setup was never run there. */
export async function getChat(chatId: number): Promise<ChatSettings | null> {
  const snap = await chats().doc(String(chatId)).get();
  return snap.data() ?? null;
}

export async function updateChat(chatId: number, patch: Partial<ChatSettings>): Promise<void> {
  await chats().doc(String(chatId)).set(patch, { merge: true });
}

export async function listChats(): Promise<{ chatId: number; settings: ChatSettings }[]> {
  const snap = await chats().get();
  return snap.docs.map((doc) => ({ chatId: Number(doc.id), settings: doc.data() }));
}

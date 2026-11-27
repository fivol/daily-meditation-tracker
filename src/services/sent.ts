import { AsyncLocalStorage } from 'node:async_hooks';
import type { Transformer } from 'grammy';
import type { Message } from 'grammy/types';
import { db } from '../db.js';
import { log } from '../logger.js';

/** A message the bot sent, kept so it can be found and edited or deleted later. */
export interface SentMessage {
  chatId: number;
  messageId: number;
  /** Bot API method that sent it: sendMessage, sendPoll, sendPhoto… */
  method: string;
  /** What sent it: a scheduler job ("reminder"), a command ("/me") or an update kind. */
  kind: string;
  /** Text, caption or poll question. */
  text?: string;
  sentAt: string;
  editedAt?: string;
  deletedAt?: string;
}

/** Every message the bot sent to a chat, keyed by message id. */
export const sentMessages = (chatId: number) =>
  db.collection(`chats/${chatId}/messages`) as FirebaseFirestore.CollectionReference<SentMessage>;

const context = new AsyncLocalStorage<string>();

/** Runs fn with every message it sends tagged with this kind. */
export const sendingAs = <T>(kind: string, fn: () => T): T => context.run(kind, fn);

const textOf = (m: Message) => m.text ?? m.caption ?? m.poll?.question;

const record = (m: Message, method: string) =>
  sentMessages(m.chat.id)
    .doc(String(m.message_id))
    .set({
      chatId: m.chat.id,
      messageId: m.message_id,
      method,
      kind: context.getStore() ?? 'other',
      text: textOf(m),
      sentAt: new Date().toISOString(),
    });

/** Keeps a record of every message the bot sends, edits or deletes. Never fails the API call. */
export const trackSent: Transformer = async (prev, method, payload, signal) => {
  const res = await prev(method, payload, signal);
  if (!res.ok) return res;
  const p = payload as { chat_id?: number; message_id?: number; text?: string; caption?: string };
  let write: Promise<unknown> | undefined;
  if (method.startsWith('send') || method === 'copyMessage' || method === 'forwardMessage') {
    const result = res.result as unknown;
    const sent = (Array.isArray(result) ? result : [result]) as Message[];
    // copyMessage returns only an id: the chat comes from the payload.
    if (method === 'copyMessage' && typeof p.chat_id === 'number') {
      const messageId = (result as { message_id: number }).message_id;
      write = sentMessages(p.chat_id).doc(String(messageId)).set({
        chatId: p.chat_id,
        messageId,
        method,
        kind: context.getStore() ?? 'other',
        sentAt: new Date().toISOString(),
      });
    } else {
      write = Promise.all(sent.filter((m) => m?.message_id).map((m) => record(m, method)));
    }
  } else if ((method === 'editMessageText' || method === 'editMessageCaption') && typeof p.chat_id === 'number' && p.message_id) {
    write = sentMessages(p.chat_id)
      .doc(String(p.message_id))
      .set({ text: p.text ?? p.caption, editedAt: new Date().toISOString() }, { merge: true });
  } else if (method === 'deleteMessage' && typeof p.chat_id === 'number' && p.message_id) {
    // Only the bot's own messages are on record; a deleted user command is not.
    const ref = sentMessages(p.chat_id).doc(String(p.message_id));
    write = ref.get().then((d) => (d.exists ? ref.update({ deletedAt: new Date().toISOString() }) : undefined));
  }
  write?.catch((err) => log.error(`Recording ${method} failed`, err));
  return res;
};

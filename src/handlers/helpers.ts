import type { Context, InputFile } from 'grammy';
import { getChat } from '../services/chats.js';
import { findByUsername, getMember } from '../services/members.js';
import type { ChatSettings, Member } from '../types.js';

export const html = { parse_mode: 'HTML' } as const;

const TEMP_REPLY_MS = 2 * 60 * 1000;
/** A dashboard takes longer to look at than a line of text. */
const TEMP_PHOTO_MS = 10 * 60 * 1000;

/** Deletes the command message to keep the group clean (needs the "Delete messages" right). */
export async function deleteCommand(ctx: Context): Promise<void> {
  if (ctx.chat?.type === 'private' || !ctx.msg) return;
  await ctx.deleteMessage().catch(() => undefined);
}

/** Reply that disappears after a while. */
export async function replyTemp(ctx: Context, text: string, ttlMs = TEMP_REPLY_MS): Promise<void> {
  const sent = await ctx.reply(text, { ...html, disable_notification: true });
  setTimeout(() => ctx.api.deleteMessage(sent.chat.id, sent.message_id).catch(() => undefined), ttlMs);
}

/** Photo reply with a caption that disappears after a while. */
export async function replyPhotoTemp(ctx: Context, photo: InputFile, caption: string, ttlMs = TEMP_PHOTO_MS): Promise<void> {
  const sent = await ctx.replyWithPhoto(photo, { caption, ...html, disable_notification: true });
  setTimeout(() => ctx.api.deleteMessage(sent.chat.id, sent.message_id).catch(() => undefined), ttlMs);
}

export async function isAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;
  const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
  return member.status === 'creator' || member.status === 'administrator';
}

/** Settings of the current group, or null (with a hint) if the bot isn't set up here. */
export async function requireChat(ctx: Context): Promise<ChatSettings | null> {
  if (!ctx.chat || ctx.chat.type === 'private') return null;
  const settings = await getChat(ctx.chat.id);
  if (!settings) await replyTemp(ctx, 'Бот ещё не настроен в этом чате. Админ: /setup');
  return settings;
}

/** Command arguments split by whitespace. */
export function args(ctx: Context): string[] {
  const text = typeof ctx.match === 'string' ? ctx.match : '';
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Member an admin command targets: the author of the replied-to message, or a leading @username
 * (which is then removed from `rest`).
 */
export async function resolveTarget(ctx: Context, rest: string[]): Promise<Member | null> {
  const chatId = ctx.chat!.id;
  if (rest[0]?.startsWith('@')) return findByUsername(chatId, rest.shift()!);
  const replied = ctx.msg?.reply_to_message?.from;
  return replied ? getMember(chatId, replied.id) : null;
}

/** Whether a command is aimed at another member (by @username or by replying to them). */
export function targetsOther(ctx: Context, rest: string[]): boolean {
  const replied = ctx.msg?.reply_to_message?.from;
  return Boolean(rest[0]?.startsWith('@') || (replied && !replied.is_bot && replied.id !== ctx.from?.id));
}

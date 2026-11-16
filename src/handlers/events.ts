import type { Bot } from 'grammy';
import { polls } from '../db.js';
import { renderWelcome } from '../render.js';
import { getChat, migrateChat } from '../services/chats.js';
import { saveCheckin } from '../services/checkins.js';
import { ensureMember, markJoined, markLeft, touchMember } from '../services/members.js';
import { createProgressMessage, scheduleProgressUpdate } from '../services/progress.js';
import { practiceDate } from '../time.js';
import { html } from './helpers.js';

const IN_CHAT = ['member', 'administrator', 'creator', 'restricted'];

export function registerEvents(bot: Bot): void {
  // A vote, a changed vote or a retracted vote (empty option_ids) in one of our polls.
  bot.on('poll_answer', async (ctx) => {
    const { poll_id, user, option_ids } = ctx.pollAnswer;
    if (!user) return;
    const poll = (await polls().doc(poll_id).get()).data();
    if (!poll) return;
    const settings = await getChat(poll.chatId);
    // Only today's polls count: after 04:00 yesterday is being (or has been) closed.
    if (!settings || poll.date !== practiceDate(settings)) return;

    await ensureMember(poll.chatId, user, practiceDate(settings));
    const minutes = option_ids.length ? (poll.optionMinutes[option_ids[0]] ?? null) : null;
    const status = !option_ids.length ? 'revoked' : minutes ? 'done' : 'skipped';
    await saveCheckin(poll.chatId, { userId: user.id, date: poll.date, slot: poll.slot, status, minutes }, 'poll');
    scheduleProgressUpdate(ctx.api, poll.chatId);
  });

  // Telegram upgraded the group to a supergroup: the chat id changes, the data follows it.
  bot.on('message:migrate_to_chat_id', async (ctx) => {
    const newId = ctx.msg.migrate_to_chat_id;
    if (!(await migrateChat(ctx.chat.id, newId))) return;
    console.log(`Chat ${ctx.chat.id} migrated to ${newId}`);
    await createProgressMessage(ctx.api, newId);
  });

  // "Bot pinned …" notices only clutter the chat.
  bot.on('message:pinned_message', async (ctx) => {
    if (ctx.from?.id !== ctx.me.id) return;
    await ctx
      .deleteMessage()
      .then(() => console.log(`Deleted pin notice ${ctx.msg.message_id} in ${ctx.chat.id}`))
      .catch((err) => console.error('Deleting a pin notice failed', err));
  });

  // Joins and leaves (requires the bot to be an admin to receive these updates).
  bot.on('chat_member', async (ctx) => {
    const { old_chat_member: before, new_chat_member: after, chat } = ctx.chatMember;
    if (after.user.is_bot) return;
    const settings = await getChat(chat.id);
    if (!settings) return;
    const wasIn = IN_CHAT.includes(before.status);
    const isIn = IN_CHAT.includes(after.status);
    if (!wasIn && isIn) {
      const member = await markJoined(chat.id, after.user, practiceDate(settings));
      await ctx.api.sendMessage(chat.id, renderWelcome(member, ctx.me.username), {
        ...html,
        disable_notification: true,
      });
    } else if (wasIn && !isIn) {
      await markLeft(chat.id, after.user.id);
    }
    scheduleProgressUpdate(ctx.api, chat.id);
  });

  // Any group message registers its author, so people show up before their first vote.
  bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'private' && ctx.from && !ctx.from.is_bot) {
      const settings = await getChat(ctx.chat.id);
      if (settings) await touchMember(ctx.chat.id, ctx.from, practiceDate(settings));
    }
    await next();
  });
}

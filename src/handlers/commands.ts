import type { Bot, Context } from 'grammy';
import { DEFAULT_SETTINGS } from '../config.js';
import { users } from '../db.js';
import { HELP_TEXT, renderMe, renderProgress } from '../render.js';
import { getChat, updateChat } from '../services/chats.js';
import { checkinsOfMember, saveCheckin } from '../services/checkins.js';
import { buildLeaderboard, recomputeMember, sendExport } from '../services/jobs.js';
import { ensureMember, getMember, updateMember } from '../services/members.js';
import { scheduleProgressUpdate } from '../services/progress.js';
import { addDays, dateRange, isValidDate, isValidTime, practiceDate, usualTime } from '../time.js';
import type { ChatSettings, Minutes, Schedule, Slot } from '../types.js';
import {
  args,
  deleteCommand,
  html,
  isAdmin,
  replyTemp,
  requireChat,
  resolveTarget,
  targetsOther,
} from './helpers.js';

type Handler = (ctx: Context) => Promise<void>;

/** Group command: deletes the command message, checks setup and (optionally) admin rights. */
function groupCommand(handler: (ctx: Context, settings: ChatSettings) => Promise<void>, adminOnly = false): Handler {
  return async (ctx) => {
    await deleteCommand(ctx);
    const settings = await requireChat(ctx);
    if (!settings) return;
    if (adminOnly && !(await isAdmin(ctx))) return replyTemp(ctx, 'Эта команда только для админов.');
    await handler(ctx, settings);
  };
}

const start: Handler = async (ctx) => {
  if (ctx.chat?.type !== 'private' || !ctx.from) return;
  await users().doc(String(ctx.from.id)).set({ canDm: true }, { merge: true });
  await ctx.reply('🙏 Готово — теперь бот сможет написать тебе лично.\n\n' + HELP_TEXT, html);
};

const help: Handler = async (ctx) => {
  await deleteCommand(ctx);
  if (ctx.chat?.type === 'private') await ctx.reply(HELP_TEXT, html);
  else await replyTemp(ctx, HELP_TEXT);
};

const setup: Handler = async (ctx) => {
  await deleteCommand(ctx);
  if (!ctx.chat || ctx.chat.type === 'private') return;
  if (!(await isAdmin(ctx))) return replyTemp(ctx, 'Эта команда только для админов.');
  const chatId = ctx.chat.id;
  const existing = await getChat(chatId);
  const settings: ChatSettings = existing ?? {
    ...DEFAULT_SETTINGS,
    startDate: practiceDate(DEFAULT_SETTINGS),
    lastClosedDate: addDays(practiceDate(DEFAULT_SETTINGS), -1),
  };
  const today = practiceDate(settings);
  const progress = await ctx.api.sendMessage(chatId, renderProgress(today, { morning: 0, evening: 0 }, 0), {
    disable_notification: true,
  });
  await ctx.api.pinChatMessage(chatId, progress.message_id, { disable_notification: true }).catch(() => undefined);
  await updateChat(chatId, { ...settings, progressMessageId: progress.message_id });
  if (ctx.from) await ensureMember(chatId, ctx.from, today);
  scheduleProgressUpdate(ctx.api, chatId);
  await replyTemp(
    ctx,
    existing
      ? '🔄 Закреплённое сообщение пересоздано.'
      : '🪷 Бот настроен. Опросы начнутся по расписанию (/settings). Участники появляются в статистике после первого голоса или сообщения.',
  );
};

const me = groupCommand(async (ctx, settings) => {
  const chatId = ctx.chat!.id;
  const today = practiceDate(settings);
  const member = await ensureMember(chatId, ctx.from!, today);
  const dates = dateRange(addDays(today, -30), today);
  const list = (await checkinsOfMember(chatId, member.userId, dates)).filter((c) => c.status === 'done');
  const firstAt = (slot: Slot) => list.filter((c) => c.slot === slot).map((c) => c.firstAt);
  const todayDone = Object.fromEntries(list.filter((c) => c.date === today).map((c) => [c.slot, c.minutes]));
  await replyTemp(
    ctx,
    renderMe({
      member,
      today: todayDone,
      usualTimes: { morning: usualTime(settings, firstAt('morning')), evening: usualTime(settings, firstAt('evening')) },
      daysWithUs: dateRange(member.joinedDate, today).length,
    }),
  );
});

const top = groupCommand(async (ctx, settings) => {
  if (settings.lastClosedDate < settings.startDate) return replyTemp(ctx, 'Таблица появится после первого закрытого дня.');
  await replyTemp(ctx, await buildLeaderboard(ctx.chat!.id, settings, settings.lastClosedDate));
});

const pause = groupCommand(async (ctx, settings) => {
  const chatId = ctx.chat!.id;
  const rest = args(ctx);
  const forOther = targetsOther(ctx, rest);
  if (forOther && !(await isAdmin(ctx))) return replyTemp(ctx, 'Ставить паузу другим могут только админы.');
  const today = practiceDate(settings);
  const target = forOther ? await resolveTarget(ctx, rest) : await ensureMember(chatId, ctx.from!, today);
  if (!target) return replyTemp(ctx, 'Не нашёл участника.');

  const daysCount = Number(rest.shift());
  if (!Number.isInteger(daysCount) || daysCount < 1 || daysCount > settings.maxPauseDays) {
    return replyTemp(ctx, `Укажи число дней от 1 до ${settings.maxPauseDays}: /pause 10 ретрит`);
  }
  const pauseUntil = addDays(today, daysCount - 1);
  const pauseReason = rest.join(' ').slice(0, 50) || undefined;
  await updateMember(chatId, target.userId, { status: 'paused', pauseUntil, pauseReason });
  scheduleProgressUpdate(ctx.api, chatId);
  await ctx.reply(`🏕 ${target.firstName} на паузе до ${pauseUntil.slice(8, 10)}.${pauseUntil.slice(5, 7)}. Хорошей практики 🙏`, {
    disable_notification: true,
  });
});

const resume = groupCommand(async (ctx, settings) => {
  const chatId = ctx.chat!.id;
  const rest = args(ctx);
  const forOther = targetsOther(ctx, rest);
  if (forOther && !(await isAdmin(ctx))) return replyTemp(ctx, 'Снимать паузу другим могут только админы.');
  const target = forOther ? await resolveTarget(ctx, rest) : await getMember(chatId, ctx.from!.id);
  if (!target || target.status !== 'paused') return replyTemp(ctx, 'Паузы нет.');
  await updateMember(chatId, target.userId, { status: 'active' });
  scheduleProgressUpdate(ctx.api, chatId);
  await replyTemp(ctx, `🌱 ${target.firstName}, с возвращением!`);
});

const fix = groupCommand(async (ctx, settings) => {
  const chatId = ctx.chat!.id;
  const rest = args(ctx);
  const target = await resolveTarget(ctx, rest);
  const [date, slot, value] = rest;
  const usage = 'Формат: /fix @user 2026-11-15 morning|evening 60|30|15|remove';
  if (!target) return replyTemp(ctx, `Не нашёл участника. ${usage}`);
  const today = practiceDate(settings);
  if (!date || !isValidDate(date) || date < settings.startDate || date > today) return replyTemp(ctx, usage);
  if (slot !== 'morning' && slot !== 'evening') return replyTemp(ctx, usage);
  const minutes = Number(value);
  if (value !== 'remove' && ![60, 30, 15].includes(minutes)) return replyTemp(ctx, usage);

  await saveCheckin(
    chatId,
    {
      userId: target.userId,
      date,
      slot,
      status: value === 'remove' ? 'revoked' : 'done',
      minutes: value === 'remove' ? null : (minutes as Minutes),
    },
    'admin',
  );
  if (date <= settings.lastClosedDate) await recomputeMember(chatId, target.userId);
  else scheduleProgressUpdate(ctx.api, chatId);
  await replyTemp(ctx, `✏️ Исправлено: ${target.firstName}, ${date}, ${slot} → ${value}`);
}, true);

const forgive = groupCommand(async (ctx) => {
  const target = await resolveTarget(ctx, args(ctx));
  if (!target) return replyTemp(ctx, 'Не нашёл участника: /forgive @user');
  await updateMember(ctx.chat!.id, target.userId, { missedInRow: 0 });
  await replyTemp(ctx, `🕊 Счётчик пропусков ${target.firstName} обнулён.`);
}, true);

const SCHEDULE_KEYS: (keyof Schedule)[] = ['morning', 'evening', 'reminder'];
const NUMBER_KEYS = ['missLimit', 'maxPauseDays', 'newcomerDays'] as const;

const settingsCommand = groupCommand(async (ctx, settings) => {
  const [key, value] = args(ctx);
  if (!key) {
    const s = settings.schedule;
    return replyTemp(
      ctx,
      [
        '⚙️ <b>Настройки</b>',
        `morning ${s.morning} · evening ${s.evening} · reminder ${s.reminder}`,
        `missLimit ${settings.missLimit} · maxPauseDays ${settings.maxPauseDays} · newcomerDays ${settings.newcomerDays}`,
        `Часовой пояс: ${settings.timezone}, день заканчивается в ${settings.dayBoundaryHour}:00`,
        '',
        'Изменить: /settings reminder 21:00',
      ].join('\n'),
    );
  }
  if ((SCHEDULE_KEYS as string[]).includes(key) && value && isValidTime(value)) {
    await updateChat(ctx.chat!.id, { schedule: { ...settings.schedule, [key]: value } as Schedule });
  } else if ((NUMBER_KEYS as readonly string[]).includes(key) && Number.isInteger(Number(value)) && Number(value) > 0) {
    await updateChat(ctx.chat!.id, { [key]: Number(value) } as Partial<ChatSettings>);
  } else {
    return replyTemp(ctx, 'Не понял. Пример: /settings reminder 21:00 или /settings missLimit 3');
  }
  await replyTemp(ctx, `✅ ${key} = ${value}`);
}, true);

const exportCommand = groupCommand(async (ctx) => {
  try {
    await sendExport(ctx.api, ctx.chat!.id, ctx.from!.id);
    await replyTemp(ctx, '📎 Отправил CSV в личку.');
  } catch {
    await replyTemp(ctx, `Не смог написать в личку — открой @${ctx.me.username} и нажми «Start».`);
  }
}, true);

export function registerCommands(bot: Bot): void {
  bot.command('start', start);
  bot.command('help', help);
  bot.command('setup', setup);
  bot.command('me', me);
  bot.command('top', top);
  bot.command('pause', pause);
  bot.command('resume', resume);
  bot.command('fix', fix);
  bot.command('forgive', forgive);
  bot.command('settings', settingsCommand);
  bot.command('export', exportCommand);
}

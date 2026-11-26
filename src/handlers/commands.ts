import { InputFile, InputMediaBuilder, type Bot, type Context } from 'grammy';
import { personalDashboard } from '../charts/personal.js';
import { toPng } from '../charts/png.js';
import { shareCards } from '../charts/share.js';
import { DEFAULT_SETTINGS } from '../config.js';
import { users } from '../db.js';
import { displayName, HELP_TEXT, PRIVATE_HELP, renderMeDetailed } from '../render.js';
import { getChat, listChats, updateChat } from '../services/chats.js';
import { saveCheckin } from '../services/checkins.js';
import { buildLeaderboard, recomputeMember, sendExport, sendSummary } from '../services/jobs.js';
import { ensureMember, getMember, updateMember } from '../services/members.js';
import { evaluateAwards } from '../services/grants.js';
import { personalStats, type PersonalStats } from '../services/personal.js';
import { latestPeriod, type PeriodKind } from '../summary.js';
import { log } from '../logger.js';
import { createProgressMessage, scheduleProgressUpdate } from '../services/progress.js';
import { addDays, isValidDate, isValidTime, practiceDate } from '../time.js';
import { MINUTES, type ChatSettings, type Minutes, type Schedule } from '../types.js';
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

/**
 * Group command: deletes the command message, checks setup and (optionally) admin rights.
 * Ignored in the private chat.
 */
function groupCommand(handler: (ctx: Context, settings: ChatSettings) => Promise<void>, adminOnly = false): Handler {
  return async (ctx) => {
    if (ctx.chat?.type === 'private') return;
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
  // The link the group's /me hands out opens the stats straight away.
  if (ctx.match === ME_PAYLOAD) return privateMe(ctx);
  await ctx.reply(PRIVATE_HELP, html);
};

const help: Handler = async (ctx) => {
  await deleteCommand(ctx);
  if (ctx.chat?.type === 'private') await ctx.reply(PRIVATE_HELP, html);
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
  await updateChat(chatId, settings);
  if (ctx.from) await ensureMember(chatId, ctx.from, practiceDate(settings));
  await createProgressMessage(ctx.api, chatId);
  await replyTemp(
    ctx,
    existing
      ? '🔄 Закреплённое сообщение пересоздано.'
      : '🪷 Бот настроен. Опросы начнутся по расписанию (/settings). Участники появляются в статистике после первого голоса или сообщения.',
  );
};

/** Payload of the deep link that leads from the group to the personal stats. */
const ME_PAYLOAD = 'me';

/** The member's pictures as one album: the big dashboard, then the share cards for social media. */
function gallery(stats: PersonalStats, caption?: string) {
  const svgs = [personalDashboard(stats.member, stats.history, stats.date), ...shareCards(stats.member, stats.history)];
  return svgs.map((svg, i) =>
    InputMediaBuilder.photo(
      new InputFile(toPng(svg), `practice-${stats.date}-${i + 1}.png`),
      i === 0 && caption ? { caption, ...html } : {},
    ),
  );
}

/** How long the group copy of the gallery stays in the chat. */
const GROUP_GALLERY_MS = 2 * 60 * 1000;

/**
 * In the group /me posts the member's gallery for a couple of minutes, with a link that opens
 * the detailed stats in the private chat.
 */
const groupMe: Handler = async (ctx) => {
  await deleteCommand(ctx);
  const settings = await requireChat(ctx);
  if (!settings || !ctx.from) return;
  const member = await getMember(ctx.chat!.id, ctx.from.id);
  if (!member) return replyTemp(ctx, 'Статистики пока нет: отметься в опросе 🙏');
  const stats = await personalStats(ctx.chat!.id, settings, member);
  const link = `https://t.me/${ctx.me.username}?start=${ME_PAYLOAD}`;
  const caption = `🧘 ${displayName(member)} · <a href="${link}">подробная статистика в личке</a>`;
  const sent = await ctx.replyWithMediaGroup(gallery(stats, caption), { disable_notification: true });
  setTimeout(() => {
    for (const m of sent) ctx.api.deleteMessage(m.chat.id, m.message_id).catch(() => undefined);
  }, GROUP_GALLERY_MS);
};

/** In private: detailed stats and the pictures for every group the user takes part in. */
const privateMe: Handler = async (ctx) => {
  let found = false;
  for (const { chatId, settings } of await listChats()) {
    const member = await getMember(chatId, ctx.from!.id);
    if (!member) continue;
    found = true;
    const chat = await ctx.api.getChat(chatId).catch(() => null);
    const chatTitle = chat && 'title' in chat && chat.title ? chat.title : 'группа';
    const stats = await personalStats(chatId, settings, member);
    await ctx.reply(renderMeDetailed({ ...stats, chatTitle }), html);
    try {
      await ctx.replyWithMediaGroup(gallery(stats));
    } catch (err) {
      log.error(`Personal pictures of ${member.userId} failed`, err);
    }
  }
  if (!found) await ctx.reply('Статистики пока нет: отметься в опросе в группе 🙏', html);
};

const me: Handler = (ctx) => (ctx.chat?.type === 'private' ? privateMe(ctx) : groupMe(ctx));

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
  const usage = 'Формат: /fix @user 2026-11-15 morning|evening 60|45|30|15|remove';
  if (!target) return replyTemp(ctx, `Не нашёл участника. ${usage}`);
  const today = practiceDate(settings);
  if (!date || !isValidDate(date) || date < settings.startDate || date > today) return replyTemp(ctx, usage);
  if (slot !== 'morning' && slot !== 'evening') return replyTemp(ctx, usage);
  const minutes = Number(value);
  if (value !== 'remove' && !(MINUTES as number[]).includes(minutes)) return replyTemp(ctx, usage);

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
  if (date <= settings.lastClosedDate) {
    await recomputeMember(chatId, target.userId);
  } else {
    scheduleProgressUpdate(ctx.api, chatId);
    await evaluateAwards(ctx.api, chatId, settings, target.userId);
  }
  await replyTemp(ctx, `✏️ Исправлено: ${target.firstName}, ${date}, ${slot} → ${value}`);
}, true);

const forgive = groupCommand(async (ctx) => {
  const target = await resolveTarget(ctx, args(ctx));
  if (!target) return replyTemp(ctx, 'Не нашёл участника: /forgive @user');
  await updateMember(ctx.chat!.id, target.userId, { missedInRow: 0 });
  await replyTemp(ctx, `🕊 Счётчик пропусков ${target.firstName} обнулён.`);
}, true);

const SCHEDULE_KEYS: (keyof Schedule)[] = ['morning', 'evening', 'reminder'];
const NUMBER_KEYS = ['missLimit', 'maxPauseDays'] as const;

const settingsCommand = groupCommand(async (ctx, settings) => {
  const [key, value] = args(ctx);
  if (!key) {
    const s = settings.schedule;
    return replyTemp(
      ctx,
      [
        '⚙️ <b>Настройки</b>',
        `morning ${s.morning} · evening ${s.evening} · reminder ${s.reminder}`,
        `missLimit ${settings.missLimit} · maxPauseDays ${settings.maxPauseDays}`,
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

const PERIOD_KINDS: PeriodKind[] = ['week', 'month', 'year'];

/** Admin preview: the summary of the latest week / month / year, sent to the admin's private chat. */
const summaryCommand = groupCommand(async (ctx, settings) => {
  const kind = (args(ctx)[0] ?? 'week') as PeriodKind;
  if (!PERIOD_KINDS.includes(kind)) return replyTemp(ctx, 'Формат: /summary week|month|year');
  if (settings.lastClosedDate < settings.startDate) return replyTemp(ctx, 'Итоги появятся после первого закрытого дня.');
  try {
    const period = latestPeriod(kind, settings.startDate, settings.lastClosedDate);
    await sendSummary(ctx.api, ctx.chat!.id, settings, period, ctx.from!.id);
    await replyTemp(ctx, '📎 Отправил итоги в личку.');
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
  bot.command('summary', summaryCommand);
  // Anything else written to the bot in private is answered with the personal stats.
  bot.chatType('private').on('message:text', privateMe);
}

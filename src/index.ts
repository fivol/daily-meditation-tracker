import { autoRetry } from '@grammyjs/auto-retry';
import { Bot } from 'grammy';
import { env } from './config.js';
import { registerCommands } from './handlers/commands.js';
import { registerEvents } from './handlers/events.js';
import { log } from './logger.js';
import { startScheduler } from './services/scheduler.js';
import { sendingAs, trackSent } from './services/sent.js';

process.on('unhandledRejection', (reason) => log.error('Unhandled rejection', reason));
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception, exiting', err);
  process.exit(1); // Docker restarts the container
});

const bot = new Bot(env.botToken);

// Retries rate limits (429), Telegram server errors (5xx) and network failures.
bot.api.config.use(autoRetry({ maxRetryAttempts: 5, maxDelaySeconds: 300 }));
// Every sent message is recorded (chats/{id}/messages) so it can be found and edited later.
bot.api.config.use(trackSent);

// Replies are tagged with the command or the kind of update that caused them.
bot.use((ctx, next) => {
  const command = ctx.msg?.text?.match(/^\/\w+/)?.[0];
  return sendingAs(command ?? Object.keys(ctx.update).find((k) => k !== 'update_id') ?? 'update', next);
});

registerEvents(bot);
registerCommands(bot);

// The update is logged in full so a lost vote or command can be restored by hand.
bot.catch(({ error, ctx }) => log.error(`Update ${ctx.update.update_id} failed`, ctx.update, error));

try {
  // The menu shows only what works in each kind of chat.
  await bot.api.setMyCommands(
    [
      { command: 'me', description: 'Моя статистика — в личке бота' },
      { command: 'top', description: 'Таблица за вчера' },
      { command: 'pause', description: 'Пауза на N дней: /pause 10 ретрит' },
      { command: 'resume', description: 'Закончить паузу' },
      { command: 'help', description: 'Правила и команды' },
    ],
    { scope: { type: 'all_group_chats' } },
  );
  await bot.api.setMyCommands(
    [
      { command: 'me', description: 'Подробная статистика' },
      { command: 'help', description: 'Правила' },
    ],
    { scope: { type: 'all_private_chats' } },
  );

  const timer = startScheduler(bot.api);
  const stop = (signal: string) => {
    log.info(`${signal} received, stopping`);
    clearInterval(timer);
    void bot.stop();
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));

  await bot.start({
    allowed_updates: ['message', 'poll_answer', 'chat_member'],
    onStart: (me) => log.info(`@${me.username} is running`),
  });
} catch (err) {
  log.error('Bot failed to start or crashed, exiting', err);
  process.exit(1);
}

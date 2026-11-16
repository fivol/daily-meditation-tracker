import { Bot } from 'grammy';
import { env } from './config.js';
import { registerCommands } from './handlers/commands.js';
import { registerEvents } from './handlers/events.js';
import { startScheduler } from './services/scheduler.js';

const bot = new Bot(env.botToken);

registerEvents(bot);
registerCommands(bot);

bot.catch(({ error, ctx }) => console.error(`Update ${ctx.update.update_id} failed`, error));

await bot.api.setMyCommands([
  { command: 'me', description: 'Моя статистика' },
  { command: 'top', description: 'Таблица за вчера' },
  { command: 'pause', description: 'Пауза на N дней: /pause 10 ретрит' },
  { command: 'resume', description: 'Закончить паузу' },
  { command: 'help', description: 'Правила и команды' },
]);

const timer = startScheduler(bot.api);

const stop = () => {
  clearInterval(timer);
  void bot.stop();
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

await bot.start({
  allowed_updates: ['message', 'poll_answer', 'chat_member'],
  onStart: (me) => console.log(`@${me.username} is running`),
});

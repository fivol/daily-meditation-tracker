// Looks up and fixes messages the bot sent (recorded in chats/{chatId}/messages).
// Usage:
//   npm run messages -- list <chatId> [kind]                 last 30 messages, newest first
//   npm run messages -- reminder <chatId> <messageId> [date] re-render a reminder with the current
//                                                            wording, as it stood when it went out
import { Api } from 'grammy';
import { env } from '../src/config.js';
import { renderReminder } from '../src/render.js';
import { getChat } from '../src/services/chats.js';
import { reminderTargets } from '../src/services/jobs.js';
import { sendingAs, sentMessages, trackSent } from '../src/services/sent.js';
import { momentOf, practiceDate } from '../src/time.js';

const [command, chatIdArg, ...rest] = process.argv.slice(2);
const chatId = Number(chatIdArg);
if (!command || !chatIdArg) {
  console.error('Usage: npm run messages -- list <chatId> [kind] | reminder <chatId> <messageId> [date]');
  process.exit(1);
}

if (command === 'list') {
  const [kind] = rest;
  const snap = await sentMessages(chatId).orderBy('sentAt', 'desc').limit(kind ? 300 : 30).get();
  const list = snap.docs.map((d) => d.data()).filter((m) => !kind || m.kind === kind).slice(0, 30);
  for (const m of list) {
    const flags = [m.editedAt && 'edited', m.deletedAt && 'deleted'].filter(Boolean).join(', ');
    const text = (m.text ?? '').replace(/\s+/g, ' ').slice(0, 70);
    console.log(`${m.messageId}\t${m.sentAt}\t${m.kind}\t${m.method}${flags ? ` (${flags})` : ''}\t${text}`);
  }
} else if (command === 'reminder') {
  const settings = await getChat(chatId);
  if (!settings) throw new Error(`Chat ${chatId} is not set up`);
  const messageId = Number(rest[0]);
  const date = rest[1] ?? practiceDate(settings);
  const ref = sentMessages(chatId).doc(String(messageId));
  const recorded = (await ref.get()).data();
  const before = recorded?.sentAt ?? momentOf(settings, date, settings.schedule.reminder).toUTC().toISO()!;
  const targets = await reminderTargets(chatId, date, before);
  if (targets.length === 0) throw new Error(`Nobody was missing practice on ${date} before ${before}`);
  const text = renderReminder(targets, settings.missLimit);
  if (!recorded) {
    // Sent before messages were recorded: put it on record now.
    await ref.set({ chatId, messageId, method: 'sendMessage', kind: 'reminder', sentAt: before });
  }
  const api = new Api(env.botToken);
  api.config.use(trackSent);
  await sendingAs('reminder', () => api.editMessageText(chatId, messageId, text, { parse_mode: 'HTML' }));
  console.log(`Edited ${messageId}:\n${text}`);
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
process.exit(0);

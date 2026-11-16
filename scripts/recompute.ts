// Rebuilds cached member aggregates from check-ins and day snapshots and grants, silently and
// retroactively, the titles and achievements the history qualifies for.
// Usage: npm run recompute -- <chatId> [userId] [--announce]
//   --announce  also posts the one-time "Раздача званий" message to the group
import { Api } from 'grammy';
import { env } from '../src/config.js';
import { renderTitlesAnnouncement } from '../src/render.js';
import { getChat } from '../src/services/chats.js';
import { evaluateAwards } from '../src/services/grants.js';
import { recomputeGroupAwards, recomputeMember } from '../src/services/jobs.js';
import { listMembers } from '../src/services/members.js';

const args = process.argv.slice(2);
const announce = args.includes('--announce');
const [chatIdArg, userIdArg] = args.filter((a) => !a.startsWith('--'));
if (!chatIdArg) {
  console.error('Usage: npm run recompute -- <chatId> [userId] [--announce]');
  process.exit(1);
}
const chatId = Number(chatIdArg);
const settings = await getChat(chatId);
if (!settings) throw new Error(`Chat ${chatId} is not set up`);
const api = new Api(env.botToken);
const userIds = userIdArg ? [Number(userIdArg)] : (await listMembers(chatId)).map((m) => m.userId);
for (const userId of userIds) {
  await recomputeMember(chatId, userId);
  // Today isn't closed yet: grant what today's sessions already meet, silently too.
  await evaluateAwards(api, chatId, settings, userId, { silent: true });
  console.log(`Recomputed ${userId}`);
}
if (!userIdArg) {
  await recomputeGroupAwards(chatId);
  console.log('Recomputed group awards');
}
if (announce) {
  const me = await api.getMe();
  await api.sendMessage(chatId, renderTitlesAnnouncement(await listMembers(chatId), me.username), {
    parse_mode: 'HTML',
    disable_notification: true,
  });
  console.log('Announcement posted');
}
process.exit(0);

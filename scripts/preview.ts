// Renders the dashboards to PNG files without sending anything anywhere:
//   npm run preview                       — demo data
//   npm run preview -- real|<chatId> [userId]  — real data from Firestore (read-only);
//                                           without userId the member is OWNER_ID
import { mkdirSync, writeFileSync } from 'node:fs';
import { groupDashboard } from '../src/charts/group.js';
import { personalDashboard } from '../src/charts/personal.js';
import { toPng } from '../src/charts/png.js';
import { shareCards } from '../src/charts/share.js';
import { demoHistory } from './demo.js';
import { latestPeriod, personalHistory, summarize, type PeriodKind } from '../src/summary.js';

const OUT = 'preview';
mkdirSync(OUT, { recursive: true });
const save = (name: string, svg: string) => {
  writeFileSync(`${OUT}/${name}.png`, toPng(svg));
  console.log(`${OUT}/${name}.png`);
};

const [chatArg, userArg] = process.argv.slice(2);
const kinds: PeriodKind[] = ['week', 'month', 'year'];

if (!chatArg) {
  // A group that started 11 days ago: the dashboards must look right with almost no history.
  const young = demoHistory(11);
  const youngWeek = latestPeriod('week', young.settings.startDate, young.settings.lastClosedDate);
  save('demo-young-week', groupDashboard(summarize(youngWeek, young, young.settings), 'Утро и вечер'));
  const newcomer = young.members[0];
  const own = young.checkins.filter((c) => c.userId === newcomer.userId);
  const ownHistory = personalHistory(newcomer, own, young.settings, young.today);
  save('demo-young-me', personalDashboard(newcomer, ownHistory, young.today));
  shareCards(newcomer, ownHistory).forEach((svg, n) => save(`demo-young-share-${n + 1}`, svg));

  const demo = demoHistory();
  for (const kind of kinds) {
    save(`demo-${kind}`, groupDashboard(summarize(latestPeriod(kind, demo.settings.startDate, demo.settings.lastClosedDate), demo, demo.settings), 'Утро и вечер'));
  }
  for (const [i, member] of [demo.members[0], demo.members.at(-1)!].entries()) {
    const checkins = demo.checkins.filter((c) => c.userId === member.userId);
    const history = personalHistory(member, checkins, demo.settings, demo.today);
    save(`demo-me-${i + 1}`, personalDashboard(member, history, demo.today));
    shareCards(member, history).forEach((svg, n) => save(`demo-me-${i + 1}-share-${n + 1}`, svg));
  }
} else {
  const { getChat, listChats } = await import('../src/services/chats.js');
  const { loadHistory, loadPersonalCheckins } = await import('../src/services/history.js');
  const { getMember } = await import('../src/services/members.js');
  const { practiceDate } = await import('../src/time.js');
  // "real" stands for the first chat the bot is set up in.
  const chatId = chatArg === 'real' ? (await listChats())[0].chatId : Number(chatArg);
  const settings = await getChat(chatId);
  if (!settings) throw new Error(`Chat ${chatId} is not set up`);
  for (const kind of kinds) {
    const period = latestPeriod(kind, settings.startDate, settings.lastClosedDate);
    save(`real-${kind}`, groupDashboard(summarize(period, await loadHistory(chatId, period), settings), 'Группа'));
  }
  const userId = Number(userArg ?? process.env.OWNER_ID);
  const member = userId ? await getMember(chatId, userId) : null;
  if (member) {
    const today = practiceDate(settings);
    const history = personalHistory(member, await loadPersonalCheckins(chatId, member.userId), settings, today);
    save('real-me', personalDashboard(member, history, today));
    shareCards(member, history).forEach((svg, n) => save(`real-share-${n + 1}`, svg));
  }
  process.exit(0);
}

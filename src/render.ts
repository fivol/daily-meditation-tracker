import type { Milestone } from './stats.js';
import { compareMembers, recentSessions, regularity } from './stats.js';
import { humanDate, shortDate } from './time.js';
import type { DayEntry, Member, Minutes, Slot } from './types.js';

export const POLL_OPTIONS: { text: string; minutes: Minutes | null }[] = [
  { text: '🧘 1 час', minutes: 60 },
  { text: '🌿 30 минут', minutes: 30 },
  { text: '🌱 15 минут', minutes: 15 },
  { text: '🙏 Сегодня не получилось', minutes: null },
];

const SLOT_TITLE: Record<Slot, string> = {
  morning: '🌅 Утренняя практика',
  evening: '🌙 Вечерняя практика',
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Russian plural: plural(5, 'день', 'дня', 'дней') → 'дней'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function displayName(m: Pick<Member, 'firstName' | 'lastName'>): string {
  return escapeHtml(m.firstName);
}

/** Mention that notifies the user even without a @username. */
export function mention(m: Pick<Member, 'userId' | 'username' | 'firstName'>): string {
  return m.username
    ? `@${m.username}`
    : `<a href="tg://user?id=${m.userId}">${escapeHtml(m.firstName)}</a>`;
}

export function pollQuestion(slot: Slot, date: string): string {
  return `${SLOT_TITLE[slot]} · ${humanDate(date)}`;
}

function strip(recent: DayEntry[], length = 7): string {
  return recent
    .slice(-length)
    .map((d) => (d.status !== 'active' ? '·' : ['○', '◐', '●'][d.sessions]))
    .join('');
}

export function milestoneText(m: Pick<Member, 'firstName'>, milestone: Milestone): string {
  const name = displayName(m);
  switch (milestone.kind) {
    case 'streak':
      return `🎉 ${name} — ${days(milestone.value)} подряд без пропусков!`;
    case 'sessions':
      return `🎉 ${name} — ${milestone.value} сессий!`;
    case 'hours':
      return `🎉 ${name} — ${milestone.value} часов практики!`;
  }
}

export interface LeaderboardInput {
  date: string;
  members: Member[];
  newcomerDays: number;
  /** Sessions the group did that day and the maximum possible. */
  group: { done: number; possible: number };
  milestones: string[];
  weekly?: string;
}

export function renderLeaderboard(input: LeaderboardInput): string {
  const visible = input.members.filter((m) => m.status !== 'removed');
  const active = visible.filter((m) => m.status === 'active');
  const ranked = active.filter((m) => m.activeDays >= input.newcomerDays).sort(compareMembers);
  const newcomers = active.filter((m) => m.activeDays < input.newcomerDays);
  const paused = visible.filter((m) => m.status === 'paused');

  const lines = [`🪷 <b>Практика за ${humanDate(input.date)}</b>`];
  if (input.group.possible > 0) {
    const { done, possible } = input.group;
    lines.push(`Группа: ${done} из ${possible} сессий (${percent(done / possible)}) 🙏`);
  }
  if (input.weekly) lines.push('', input.weekly);

  if (ranked.length > 0) {
    lines.push('', '<i>за 30 дней · сессий всего · серия · 7 дней</i>');
    ranked.forEach((m, i) => {
      const warning = m.missedInRow > 0 ? `  ⚠️ ${days(m.missedInRow)}` : '';
      lines.push(
        `${i + 1}. ${displayName(m)}  ${percent(regularity(m))}  ${m.sessions}  🔥${m.currentStreak}  ${strip(m.recent)}${warning}`,
      );
    });
  }

  if (newcomers.length > 0) {
    const list = newcomers
      .map((m) => `${displayName(m)} (${days(m.activeDays)} с нами, ${m.sessions} ${plural(m.sessions, 'сессия', 'сессии', 'сессий')})`)
      .join(', ');
    lines.push('', `🌱 Новички: ${list}`);
  }
  if (paused.length > 0) {
    const list = paused
      .map((m) => {
        const details = [m.pauseReason, m.pauseUntil && `до ${shortDate(m.pauseUntil)}`].filter(Boolean);
        return details.length ? `${displayName(m)} (${escapeHtml(details.join(', '))})` : displayName(m);
      })
      .join(', ');
    lines.push('', `🏕 На паузе: ${list}`);
  }
  if (input.milestones.length > 0) lines.push('', ...input.milestones);

  lines.push('', '● обе практики · ◐ одна · ○ нет · · пауза');
  return lines.join('\n');
}

/** Weekly recap built from the last 7 closed days of every member. */
export function renderWeekly(members: Member[]): string {
  const tracked = members.filter((m) => m.status !== 'removed');
  const week = tracked.map((m) => ({ m, days: m.recent.slice(-7) }));

  let sessions = 0;
  let minutes = 0;
  let possible = 0;
  const byDate = new Map<string, number>();
  for (const { days } of week) {
    for (const d of days) {
      sessions += d.sessions;
      minutes += d.minutes;
      if (d.status === 'active') possible += 2;
      byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.sessions);
    }
  }
  const best = [...byDate.entries()].sort((a, b) => b[1] - a[1])[0];
  const perfect = week.filter(({ days }) => days.length === 7 && days.every((d) => d.sessions === 2));
  const everyDay = week.filter(
    ({ days }) => days.length === 7 && days.every((d) => d.sessions > 0) && !perfect.some((p) => p.days === days),
  );

  const lines = ['📅 <b>Итоги недели</b>'];
  if (possible > 0) {
    lines.push(
      `Вместе: ${sessions} ${plural(sessions, 'сессия', 'сессии', 'сессий')} · ${Math.round(minutes / 60)} ч · ${percent(sessions / possible)} от максимума`,
    );
  }
  if (best) lines.push(`Лучший день: ${humanDate(best[0])} (${best[1]})`);
  if (perfect.length) lines.push(`💎 Идеальная неделя (14/14): ${perfect.map(({ m }) => displayName(m)).join(', ')}`);
  if (everyDay.length) lines.push(`✨ Практика каждый день: ${everyDay.map(({ m }) => displayName(m)).join(', ')}`);
  return lines.join('\n');
}

export function renderProgress(date: string, counts: Record<Slot, number>, total: number): string {
  return `☀️ Сегодня, ${humanDate(date)}: утро ${counts.morning}/${total} · вечер ${counts.evening}/${total}`;
}

export function renderReminder(targets: Member[], missLimit: number): string {
  const lines = ['🌙 <b>Вечерняя практика ещё впереди</b>'];
  const fresh = targets.filter((m) => m.missedInRow === 0);
  const missing = targets.filter((m) => m.missedInRow > 0);
  if (fresh.length) lines.push(`${fresh.map(mention).join(' · ')} — сегодня пока ни одной сессии`);
  for (const m of missing) {
    const dayNumber = m.missedInRow + 1;
    const warning =
      dayNumber >= missLimit
        ? 'Если сегодня не получится, ночью бот попрощается с тобой (вернуться можно в любой момент) 🙏'
        : 'Час на подушке — и всё в порядке 🙏';
    lines.push(`${mention(m)} — ${dayNumber}-й день без практики. ${warning}`);
  }
  return lines.join('\n');
}

export interface MeInput {
  member: Member;
  today: Partial<Record<Slot, Minutes | null>>;
  usualTimes: Partial<Record<Slot, string>>;
  daysWithUs: number;
}

export function renderMe({ member: m, today, usualTimes, daysWithUs }: MeInput): string {
  const recentDone = recentSessions(m);
  const recentPossible = 2 * m.recent.filter((d) => d.status === 'active').length;
  const mark = (slot: Slot) => (today[slot] ? `✅ ${today[slot]} мин` : '—');
  const lines = [
    `🧘 <b>${displayName(m)}</b> · с нами ${days(daysWithUs)}`,
    recentPossible > 0
      ? `📈 Регулярность за 30 дней: ${percent(regularity(m))} (${recentDone} из ${recentPossible} сессий)`
      : '📈 Регулярность появится после первого закрытого дня (в 04:00)',
    `📿 Сессий: ${m.sessions} (утро ${m.morningSessions} · вечер ${m.eveningSessions}) · ${Math.round(m.minutes / 60)} ч`,
    `📅 Дней с практикой: ${m.practicedDays} · обе практики: ${m.fullDays}`,
    `🔥 Серия: ${days(m.currentStreak)} (рекорд — ${m.bestStreak})`,
    `☀️ Сегодня: утро ${mark('morning')} · вечер ${mark('evening')}`,
  ];
  const usual = [
    usualTimes.morning && `утро ~${usualTimes.morning}`,
    usualTimes.evening && `вечер ~${usualTimes.evening}`,
  ].filter(Boolean);
  if (usual.length) lines.push(`⏰ Обычно отмечаешься: ${usual.join(' · ')}`);
  if (m.status === 'paused' && m.pauseUntil) lines.push(`🏕 На паузе до ${shortDate(m.pauseUntil)}`);
  return lines.join('\n');
}

export function renderRemoval(m: Member): string {
  return `${displayName(m)} взял(а) паузу от чата. Возвращайся, когда будешь готов(а) 🙏`;
}

export function renderRemovalDm(chatTitle: string, inviteLink: string): string {
  return (
    `Ты три дня не практиковал(а), поэтому бот убрал тебя из чата «${escapeHtml(chatTitle)}». ` +
    `Вся статистика сохранена. Когда будешь готов(а) вернуться — вот ссылка: ${inviteLink} 🙏`
  );
}

export function renderWelcome(m: Member): string {
  return (
    `Добро пожаловать, ${mention(m)} 🙏\n` +
    `Утром и вечером бот присылает опрос — просто отметь, сколько сидел(а). Правила: /help`
  );
}

/** Reply to anything in the private chat: the bot lives in the group. */
export const PRIVATE_TEXT =
  '🪷 Этот бот работает в группе: там опросы, таблица и /me — твоя статистика.\n' +
  'Сюда он напишет, только если понадобится, например пришлёт ссылку, чтобы вернуться в группу.';

export const HELP_TEXT = `🪷 <b>Как это работает</b>

• В 04:00 день закрывается: итоги вчерашнего дня и сразу утренний опрос. В 16:00 — вечерний. Отметься, когда помедитируешь: 1 час, 30 или 15 минут. Ошибся — «Retract vote» и проголосуй заново.
• Опросы открыты до 04:00 следующего дня.
• В 21:30 бот напоминает тем, у кого сегодня ещё ни одной сессии.
• Регулярность — доля сделанных сессий (утро + вечер) за последние 30 дней. По ней строится таблица.
• Три дня подряд без практики — бот убирает из чата. Вернуться можно в любой момент, статистика сохраняется.

<b>Команды</b>
/me — моя статистика
/top — таблица
/pause 10 ретрит — пауза на N дней (серия замораживается, напоминаний нет)
/resume — закончить паузу

<b>Для админов</b>
/setup · /settings · /fix · /forgive · /pause @user N · /export`;

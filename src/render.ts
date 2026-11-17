import {
  ACHIEVEMENTS,
  achievementCount,
  GROUP_AWARDS,
  titleAt,
  titleLevelOf,
  type AwardState,
} from './awards.js';
import { TITLES } from './config.js';
import type { DaySessions } from './stats.js';
import { rankMembers, recentMinutes, recentSessions, regularity } from './stats.js';
import { dayMonth, humanDate, shortDate } from './time.js';
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

/** Adds a period unless the text already ends with punctuation or an emoji. */
const sentence = (text: string) => (/[.!?…\p{Extended_Pictographic}]\s*$/u.test(text) ? text : `${text}.`);

const hoursText = (n: number) => `${n} ${plural(n, 'час', 'часа', 'часов')}`;

/** Congratulation for awards granted by one vote: the top title first, then achievements. */
export function renderAwards(m: Pick<Member, 'firstName'>, ids: string[]): string {
  const name = displayName(m);
  const top = Math.max(0, ...ids.map((id) => titleLevelOf(id) ?? 0));
  const parts: string[] = [];
  if (top) {
    const title = titleAt(top)!;
    const next = titleAt(top + 1);
    const lines = ['🎉 <b>Новое звание!</b>', `${name} теперь ${title.emoji} ${title.name}`, sentence(title.line)];
    if (next) lines.push(`Дальше: ${next.emoji} ${next.name} · ещё ${next.hours - title.hours} ч`);
    parts.push(lines.join('\n'));
  }
  for (const a of ACHIEVEMENTS.filter((a) => ids.includes(a.id))) {
    const lines = [`${a.emoji} ${name} — «${a.name}»`, sentence(a.text)];
    if (a.id === 'firstStep' && !top) {
      const first = TITLES[0];
      lines.push(`Дальше: звание ${first.emoji} ${first.name} — ${hoursText(first.hours)} практики`);
    }
    parts.push(lines.join('\n'));
  }
  return parts.join('\n\n');
}

/** One line for the leaderboard / weekly recap: the top title and every achievement of a member. */
export function awardLines(m: Pick<Member, 'firstName'>, ids: string[]): string[] {
  const top = Math.max(0, ...ids.map((id) => titleLevelOf(id) ?? 0));
  const names = [
    ...(top ? [`звание ${titleAt(top)!.emoji} ${titleAt(top)!.name}`] : []),
    ...ACHIEVEMENTS.filter((a) => ids.includes(a.id)).map((a) => `${a.emoji} ${a.name}`),
  ];
  return names.length ? [`${displayName(m)} — ${names.join(', ')}`] : [];
}

export function groupAwardLine(id: string): string {
  const award = GROUP_AWARDS.find((a) => a.id === id)!;
  return `${award.emoji} Группа получает «${award.name}»!`;
}

export interface LeaderboardInput {
  date: string;
  members: Member[];
  /** Sessions the group did that day and the maximum possible. */
  group: { done: number; possible: number };
  /** Titles and achievements of the day. */
  awardLines: string[];
  missLimit: number;
  weekly?: string;
}

/** A streak is worth mentioning from this length on. */
const NOTABLE_STREAK = 3;

/** Active members who will be removed at the next close unless they practice today. */
const atRisk = (m: Member, missLimit: number) => m.status === 'active' && m.missedInRow >= missLimit - 1;

/** Leaderboard entry: name with the title, then 30-day hours and regularity, streak, warnings. */
function leaderboardEntry(m: Member, place: number, missLimit: number): string[] {
  const title = m.title ? titleAt(m.title) : undefined;
  const minutes = recentMinutes(m);
  const details = [
    // No time means no sessions: a single zero instead of "0 ч · 0%".
    minutes > 0 ? `за 30 дней: ${hours(minutes)} · ${percent(regularity(m))}` : 'за 30 дней: 0',
    m.currentStreak >= NOTABLE_STREAK && `🔥 ${days(m.currentStreak)} подряд`,
    m.missedInRow > 0 && `⚠️ без практики ${days(m.missedInRow)}`,
  ].filter(Boolean);
  const lines = [`${place}. ${displayName(m)}${title ? ` · ${title.emoji} ${title.name}` : ''}`, `   ${details.join(' · ')}`];
  if (atRisk(m, missLimit)) lines.push('   ❗ без отметки сегодня бот удалит из чата');
  return lines;
}

export function renderLeaderboard(input: LeaderboardInput): string {
  const visible = input.members.filter((m) => m.status !== 'removed');
  const ranked = rankMembers(visible);
  const paused = visible.filter((m) => m.status === 'paused');

  const lines = [`🪷 <b>Практика за ${humanDate(input.date)}</b>`];
  if (input.group.possible > 0) {
    const { done, possible } = input.group;
    lines.push(`Группа: ${done} из ${possible} сессий (${percent(done / possible)}) 🙏`);
  }
  if (input.weekly) lines.push('', input.weekly);

  if (ranked.length > 0) {
    lines.push('');
    ranked.forEach((m, i) => lines.push(...leaderboardEntry(m, i + 1, input.missLimit)));
  }
  if (paused.length > 0) {
    lines.push('', '🏕 <b>На паузе</b>');
    for (const m of paused) {
      const details = [m.pauseReason, m.pauseUntil && `до ${shortDate(m.pauseUntil)}`].filter(Boolean);
      lines.push(details.length ? `${displayName(m)} — ${escapeHtml(details.join(', '))}` : displayName(m));
    }
  }
  if (input.awardLines.length > 0) lines.push('', '🏅 <b>Награды дня</b>', ...input.awardLines);
  const leaving = ranked.filter((m) => atRisk(m, input.missLimit));
  if (leaving.length > 0) {
    lines.push(
      '',
      '❗ <b>Последний день</b>',
      `${leaving.map(displayName).join(', ')} — если сегодня не отметиться, ночью бот удалит из чата. Вернуться можно в любой момент 🙏`,
    );
  }
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

  const weekDates = new Set([...byDate.keys()]);
  const earned = tracked.flatMap((m) => {
    const ids = Object.entries(m.awards ?? {}).filter(([, a]) => weekDates.has(a.date)).map(([id]) => id);
    return ids.length ? awardLines(m, ids) : [];
  });
  if (earned.length) lines.push('', '🏅 <b>Новые звания и достижения за неделю</b>', ...earned);
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
  /** Aggregates with today's sessions already counted. */
  member: Member;
  /** Current practice day. */
  date: string;
  today: DaySessions;
  usualTimes: Partial<Record<Slot, string>>;
  daysWithUs: number;
}

const hours = (minutes: number) =>
  minutes < 60
    ? `${Math.round(minutes)} мин`
    : `${minutes < 600 ? String(Number((minutes / 60).toFixed(1))).replace('.', ',') : Math.round(minutes / 60)} ч`;

/** Current title, the next one and how far it is. */
function titleProgress(m: Member) {
  const level = m.title ?? 0;
  const current = titleAt(level);
  const next = titleAt(level + 1);
  const left = next ? Math.max(next.hours * 60 - m.minutes, 0) : 0;
  return { current, next, left };
}

/** "🎒 Старый студент · 112 ч · до 🧡 Монаха 88 ч · 🏅 4 из 19" */
function titleLine(m: Member): string {
  const { current, next, left } = titleProgress(m);
  return [
    current ? `${current.emoji} ${current.name}` : 'Звания пока нет',
    hours(m.minutes),
    next ? `до ${next.emoji} ${next.genitive} ${hours(left)}` : 'высшее звание',
    `🏅 ${achievementCount(m.awards)} из ${ACHIEVEMENTS.length}`,
  ].join(' · ');
}

const sessionMark = (today: DaySessions, slot: Slot) => (today[slot] ? `✅ ${today[slot]!.minutes} мин` : '—');

export function renderMe({ member: m, today, usualTimes, daysWithUs }: MeInput): string {
  const recentDone = recentSessions(m);
  const recentPossible = 2 * m.recent.filter((d) => d.status === 'active').length;
  const mark = (slot: Slot) => sessionMark(today, slot);
  const lines = [
    `🧘 <b>${displayName(m)}</b> · с нами ${days(daysWithUs)}`,
    titleLine(m),
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

export interface DetailedMeInput extends MeInput {
  chatTitle: string;
  /** Place in the leaderboard; null when not ranked (paused). */
  rank: { place: number; total: number } | null;
  /** Sessions of the last 30 days by reported duration. */
  durations: Record<Minutes, number>;
}

/** Regularity of a window as "85% (51 из 60)". */
function ratio(recent: DayEntry[]): string | null {
  const possible = 2 * recent.filter((d) => d.status === 'active').length;
  if (possible === 0) return null;
  const done = recentSessions({ recent });
  return `${percent(done / possible)} (${done} из ${possible})`;
}

/** Full personal stats for the private chat. */
export function renderMeDetailed(input: DetailedMeInput): string {
  const { member: m, date, today, usualTimes, daysWithUs, chatTitle, rank, durations } = input;
  const mark = (slot: Slot) => sessionMark(today, slot);
  const month = ratio(m.recent);
  const week = ratio(m.recent.slice(-7));
  const { current, next, left } = titleProgress(m);

  const lines = [
    `🧘 <b>${displayName(m)}</b> · ${escapeHtml(chatTitle)}`,
    `С нами ${days(daysWithUs)}, с ${dayMonth(m.joinedDate)}`,
    '',
    current ? `${current.emoji} <b>${current.name}</b> · ${hours(m.minutes)}` : `Звания пока нет · ${hours(m.minutes)}`,
  ];
  if (next) {
    const from = current?.hours ?? 0;
    const filled = Math.min(10, Math.floor((10 * (m.minutes / 60 - from)) / (next.hours - from)));
    lines.push(`До ${next.emoji} ${next.genitive}: ${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)} ${hours(left)}`);
  }
  lines.push(
    '',
    '📈 <b>Регулярность</b>',
    month ? `За 30 дней: ${month} · за 7 дней: ${week}` : 'Появится после первого закрытого дня (в 04:00)',
  );
  if (rank) lines.push(`🏆 Место в таблице: ${rank.place} из ${rank.total}`);
  else if (m.status === 'paused') lines.push(`🏕 На паузе${m.pauseUntil ? ` до ${shortDate(m.pauseUntil)}` : ''}`);
  lines.push(`🔥 Серия: ${days(m.currentStreak)} · рекорд ${days(m.bestStreak)}`);
  if (m.missedInRow > 0) lines.push(`⚠️ Без практики ${days(m.missedInRow)} подряд`);

  lines.push('', '📿 <b>Всего</b>', `Сессий: ${m.sessions} — утро ${m.morningSessions} · вечер ${m.eveningSessions}`);
  if (m.sessions > 0) {
    lines.push(`Время: ${hours(m.minutes)} · в среднем ${Math.round(m.minutes / m.sessions)} мин за сессию`);
  }
  lines.push(`Дней с практикой: ${m.practicedDays} из ${m.activeDays} · обе практики: ${m.fullDays}`);

  lines.push('', `☀️ <b>Сегодня</b>: утро ${mark('morning')} · вечер ${mark('evening')}`);
  const usual = [
    usualTimes.morning && `утро ~${usualTimes.morning}`,
    usualTimes.evening && `вечер ~${usualTimes.evening}`,
  ].filter(Boolean);
  if (usual.length) lines.push(`⏰ Обычно отмечаешься: ${usual.join(' · ')}`);
  const byDuration = ([60, 30, 15] as const)
    .filter((min) => durations[min] > 0)
    .map((min) => `${min === 60 ? '1 ч' : `${min} мин`} ×${durations[min]}`);
  if (byDuration.length) lines.push(`⏱ За 30 дней: ${byDuration.join(' · ')}`);

  if (m.recent.length > 0) {
    const calendar = strip(m.recent, 30).match(/.{1,10}/gu) ?? [];
    lines.push('', '🗓 <b>Последние 30 дней</b>', ...calendar.map((row) => `<code>${row}</code>`));
    lines.push('● обе · ◐ одна · ○ нет · · пауза');
  }

  lines.push('', ...achievementsList(m, { ...m, date, removedOn: m.removedOn }));
  return lines.join('\n');
}

/** Earned achievements with dates, then locked ones with conditions and progress; secrets hidden. */
function achievementsList(m: Member, state: AwardState): string[] {
  const awards = m.awards ?? {};
  const earned = ACHIEVEMENTS.filter((a) => awards[a.id]);
  const locked = ACHIEVEMENTS.filter((a) => !awards[a.id]);
  return [
    `🏅 <b>Достижения: ${earned.length} из ${ACHIEVEMENTS.length}</b>`,
    ...earned.map((a) => `✅ ${a.emoji} ${a.name} · ${dayMonth(awards[a.id].date)}`),
    ...locked.map((a) => {
      if (a.secret) return '❓ Секретное';
      const progress = a.progress ? ` (${a.progress(state)})` : '';
      return `🔒 ${a.emoji} ${a.name} — ${a.condition}${progress}`;
    }),
  ];
}

/** One-time post introducing titles: everyone with their title, by hours. */
export function renderTitlesAnnouncement(members: Member[], botUsername: string): string {
  const visible = members.filter((m) => m.status !== 'removed').sort((a, b) => b.minutes - a.minutes);
  const titled = visible.filter((m) => m.title);
  const untitled = visible.filter((m) => !m.title && m.minutes > 0);
  const first = TITLES[0];
  const lines = [
    '🏅 <b>Раздача званий</b>',
    'Теперь за часы практики даются звания, а за особые усилия — достижения.',
    '',
  ];
  if (titled.length) {
    lines.push(...titled.map((m) => `${titleAt(m.title!)!.emoji} ${displayName(m)} — ${titleAt(m.title!)!.name} · ${hours(m.minutes)}`));
  } else {
    lines.push(`Званий пока ни у кого нет. Первое — ${first.emoji} ${first.name} — за ${hoursText(first.hours)} практики.`);
  }
  if (untitled.length) {
    lines.push('', `До звания ${first.emoji} ${first.name}: ${untitled.map((m) => `${displayName(m)} (${hours(m.minutes)})`).join(', ')}`);
  }
  lines.push('', `Свои достижения и прогресс — /me в личке у @${botUsername}`);
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

const RULES = `🪷 <b>Как это работает</b>

• В 04:00 день закрывается: итоги вчерашнего дня и сразу утренний опрос. В 16:00 — вечерний. Отметься, когда помедитируешь: 1 час, 30 или 15 минут. Ошибся — «Retract vote» и проголосуй заново.
• Опросы открыты до 04:00 следующего дня.
• В 21:30 бот напоминает тем, у кого сегодня ещё ни одной сессии.
• Таблица отсортирована по часам практики за последние 30 дней. Рядом — регулярность: доля сделанных сессий (утро + вечер) за те же 30 дней.
• Три дня подряд без практики — бот убирает из чата. Вернуться можно в любой момент, статистика сохраняется.
• Звания растут с часами практики, достижения дают один раз за особые усилия. Поздравление приходит сразу после голоса; своё звание, прогресс и все достижения — в /me в личке у бота.`;

export const HELP_TEXT = `${RULES}

<b>Команды</b>
/me — моя статистика
/top — таблица
/pause 10 ретрит — пауза на N дней (серия замораживается, напоминаний нет)
/resume — закончить паузу

<b>Для админов</b>
/setup · /settings · /fix · /forgive · /pause @user N · /export`;

/** Help in the private chat: only what works there. */
export const PRIVATE_HELP = `${RULES}

/me — подробная статистика`;

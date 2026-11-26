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
import { averageSessionMinutes, rankMembers, recentMinutes, regularity } from './stats.js';
import type { GroupSummary, PeriodKind, PersonalHistory, PersonalWindow } from './summary.js';
import { dateSpan, dayMonth, humanDate, shortDate } from './time.js';
import { MINUTES, type DayEntry, type Member, type Minutes, type Slot } from './types.js';

export const POLL_OPTIONS: { text: string; minutes: Minutes | null }[] = [
  { text: '🧘 1 час', minutes: 60 },
  { text: '🪷 45 минут', minutes: 45 },
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
}

/** A streak is worth mentioning from this length on. */
const NOTABLE_STREAK = 3;

/** Active members who will be removed at the next close unless they practice today. */
const atRisk = (m: Member, missLimit: number) => m.status === 'active' && m.missedInRow >= missLimit - 1;

/** Leaderboard entry: name with the title, then 30-day hours, regularity and average session, streak, warnings. */
function leaderboardEntry(m: Member, place: number, missLimit: number): string[] {
  const title = m.title ? titleAt(m.title) : undefined;
  const minutes = recentMinutes(m);
  const details = [
    // No time means no sessions: a single zero instead of "0 ч · 0%".
    minutes > 0
      ? `за 30 дней: ${hours(minutes)} · ${percent(regularity(m))} · ср. ${Math.round(averageSessionMinutes(m))} мин`
      : 'за 30 дней: 0',
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

  if (ranked.length > 0) {
    lines.push('');
    // A blank line between members so the two-line entries don't run together.
    ranked.forEach((m, i) => lines.push(...(i > 0 ? [''] : []), ...leaderboardEntry(m, i + 1, input.missLimit)));
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

const PERIOD_WORDS: Record<PeriodKind, { title: string; joys: string; perfect: string; prev: string; than: string; each: string }> = {
  week: { title: 'Итоги недели', joys: 'Радости недели', perfect: 'Все сессии недели', prev: 'к прошлой неделе', than: 'чем на прошлой неделе', each: 'У каждого за неделю' },
  month: { title: 'Итоги месяца', joys: 'Радости месяца', perfect: 'Все сессии месяца', prev: 'к прошлому месяцу', than: 'чем в прошлом месяце', each: 'У каждого за месяц' },
  year: { title: 'Итоги года', joys: 'Радости года', perfect: 'Все сессии года', prev: 'к прошлому году', than: 'чем в прошлом году', each: 'У каждого за год' },
};

const sessionsText = (n: number) => `${n} ${plural(n, 'сессия', 'сессии', 'сессий')}`;
const peopleText = (n: number) => `${n} ${plural(n, 'человек', 'человека', 'человек')}`;

/** More award lines than this are summed up as a count instead of listed. */
const MAX_AWARD_LINES = 30;

/**
 * Summary of a week, a month or a year: what the group did together, what there is to be glad
 * about, and everyone's own period. Names are alphabetical and nobody is ranked.
 */
export function renderSummary(s: GroupSummary): string {
  const words = PERIOD_WORDS[s.period.kind];
  const { totals, prev } = s;
  const lines = [`📅 <b>${words.title} · ${dateSpan(s.period.from, s.period.to)}</b>`, '', '🪷 <b>Вместе</b>'];
  lines.push(`${sessionsText(totals.sessions)} · ${hours(totals.minutes)} практики`);

  const share = totals.possible > 0 ? totals.sessions / totals.possible : 0;
  const gain = prev ? Math.round(100 * (share - prev.sessions / prev.possible)) : 0;
  lines.push(`Регулярность: ${percent(share)} (${totals.sessions} из ${totals.possible})${gain > 0 ? ` · ↑ +${gain} п.п. ${words.prev}` : ''}`);
  if (prev && totals.minutes > prev.minutes) lines.push(`Времени на подушке — на ${hours(totals.minutes - prev.minutes)} больше, ${words.than} 🌱`);
  lines.push(`Практиковали: ${peopleText(totals.people)}`);
  const best = [...s.days].filter((d) => d.possible > 0).sort((a, b) => b.sessions / b.possible - a.sessions / a.possible)[0];
  if (best && s.days.length > 1) lines.push(`Самый дружный день: ${humanDate(best.date)} — ${percent(best.sessions / best.possible)}`);
  lines.push(`С первого дня группы: ${hours(s.totalMinutes)} вместе`);

  const practiced = s.people.filter((p) => p.sessions > 0);
  const names = (list: typeof practiced) => list.map((p) => displayName(p.member)).join(', ');
  const wholePeriod = practiced.filter((p) => p.activeDays === s.days.length);
  const perfect = wholePeriod.filter((p) => p.sessions === 2 * p.activeDays);
  const everyDay = wholePeriod.filter((p) => p.practicedDays === p.activeDays && !perfect.includes(p));
  const grew = practiced.filter((p) => p.prevMinutes !== null && p.minutes > p.prevMinutes);
  const joys: string[] = [];
  if (perfect.length) joys.push(`💎 ${words.perfect}: ${names(perfect)}`);
  if (everyDay.length) joys.push(`🌿 Каждый день на подушке: ${names(everyDay)}`);
  if (grew.length) {
    joys.push(`🌱 Прибавили ${words.prev}: ${grew.map((p) => `${displayName(p.member)} (+${hours(p.minutes - p.prevMinutes!)})`).join(', ')}`);
  }
  if (s.streaks.week > 0) joys.push(`🔥 На серии от 7 дней: ${peopleText(s.streaks.week)}`);
  if (s.streaks.month > 0) joys.push(`🌙 На серии от 30 дней: ${peopleText(s.streaks.month)}`);
  joys.push(...s.groupAwards.map(groupAwardLine));
  if (joys.length) lines.push('', `✨ <b>${words.joys}</b>`, ...joys);

  const earned = s.people.flatMap((p) => awardLines(p.member, p.awards));
  if (earned.length > MAX_AWARD_LINES) {
    const count = s.people.reduce((sum, p) => sum + p.awards.length, 0);
    lines.push('', `🏅 Новых званий и достижений: ${count}`);
  } else if (earned.length) {
    lines.push('', '🏅 <b>Новые звания и достижения</b>', ...earned);
  }

  if (practiced.length) {
    lines.push('', `🧘 <b>${words.each}</b>`);
    lines.push(...practiced.map((p) => `${displayName(p.member)} — ${sessionsText(p.sessions)} · ${hours(p.minutes)}`));
  }
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
  history: PersonalHistory;
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

export interface DetailedMeInput extends MeInput {
  chatTitle: string;
}

/** " · ↑ +1,5 ч" when the window grew against the one before it; dips are not mentioned. */
function growth(w: PersonalWindow): string {
  return w.prevMinutes !== null && w.minutes > w.prevMinutes ? ` · ↑ +${hours(w.minutes - w.prevMinutes)}` : '';
}

/** One window of practice: "86% (12 из 14) · 11,5 ч · ↑ +1,5 ч". */
function windowLine(label: string, w: PersonalWindow): string {
  const share = w.possible > 0 ? `${percent(w.sessions / w.possible)} (${w.sessions} из ${w.possible}) · ` : '';
  return `${label}: ${share}${hours(w.minutes)}${growth(w)}`;
}

const WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

/** Full personal stats for the private chat. */
export function renderMeDetailed(input: DetailedMeInput): string {
  const { member: m, date, today, usualTimes, daysWithUs, chatTitle, history } = input;
  const { durations, windows } = history;
  const mark = (slot: Slot) => sessionMark(today, slot);
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
  lines.push('', '📈 <b>Регулярность и время</b>');
  if (windows.month.possible > 0) {
    lines.push(windowLine('7 дней', windows.week), windowLine('30 дней', windows.month), windowLine('Всё время', windows.all));
    const perDay = Math.round(windows.month.minutes / m.recent.length);
    lines.push(`В среднем за 30 дней — ${perDay} мин в день`);
  } else {
    lines.push('Появится после первого закрытого дня (в 04:00)');
  }
  if (m.status === 'paused') lines.push(`🏕 На паузе${m.pauseUntil ? ` до ${shortDate(m.pauseUntil)}` : ''}`);
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
  const byDuration = MINUTES
    .filter((min) => durations[min] > 0)
    .map((min) => `${min === 60 ? '1 ч' : `${min} мин`} ×${durations[min]}`);
  if (byDuration.length) lines.push(`⏱ Сессии: ${byDuration.join(' · ')}`);
  const favourite = Math.max(...history.weekdays);
  if (m.practicedDays >= 14 && favourite > 0) lines.push(`📆 Чаще всего практикуешь: ${WEEKDAYS[history.weekdays.indexOf(favourite)]}`);
  const bestWeek = Math.max(...history.weeks.map((w) => w.morning + w.evening));
  if (history.weeks.filter((w) => w.sessions > 0).length > 1) lines.push(`🌟 Самая насыщенная неделя из последних: ${hours(bestWeek)}`);

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

• В 04:00 день закрывается: итоги вчерашнего дня и сразу утренний опрос. В 16:00 — вечерний. Отметься, когда помедитируешь: 1 час, 45, 30 или 15 минут. Ошибся — «Retract vote» и проголосуй заново.
• Опросы открыты до 04:00 следующего дня.
• В 21:30 бот напоминает тем, у кого сегодня ещё ни одной сессии.
• Раз в неделю, в месяц и в год — итоги группы: сообщение и картинка о том, как мы растём вместе.
• Таблица отсортирована по часам практики за последние 30 дней. Рядом — регулярность: доля сделанных сессий (утро + вечер) за те же 30 дней.
• Три дня подряд без практики — бот убирает из чата. Вернуться можно в любой момент, статистика сохраняется.
• Звания растут с часами практики, достижения дают один раз за особые усилия. Поздравление приходит сразу после голоса; своё звание, прогресс и все достижения — в /me в личке у бота.
• /me присылает картинки: вся твоя практика за неделю, месяц и всё время и карточки, которыми можно поделиться в соцсетях. В группе они висят пару минут, подробная статистика — в личке у бота.`;

export const HELP_TEXT = `${RULES}

<b>Команды</b>
/me — мои картинки (подробно — в личке у бота)
/top — таблица
/pause 10 ретрит — пауза на N дней (серия замораживается, напоминаний нет)
/resume — закончить паузу

<b>Для админов</b>
/setup · /settings · /fix · /forgive · /pause @user N · /export · /summary`;

/** Help in the private chat: only what works there. */
export const PRIVATE_HELP = `${RULES}

/me — подробная статистика, картинка твоей практики и карточки для соцсетей`;

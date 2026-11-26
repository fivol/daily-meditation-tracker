# Titles and achievements

Two independent mechanics. A **title** reflects experience: total hours of practice. An
**achievement** is granted once for a specific effort. Nothing is taken away after a day closes.
Definitions live in code: titles in `src/config.ts` (`TITLES`), achievements in `src/awards.ts`.

## Titles

Hours = minutes of all `done` sessions (60 / 45 / 30 / 15) ever, including sessions on paused days and
admin fixes. A member holds the highest title reached; there is none below 2 hours.

| # | Title | Hours | At 2 h/day |
|---|---|---|---|
| 1 | 🌱 Искатель | 2 | 1 day |
| 2 | 📖 Ученик | 5 | 3 days |
| 3 | 🐣 Падаван | 10 | 5 days |
| 4 | 📿 Послушник | 30 | 2 weeks |
| 5 | 🌿 Практик | 60 | a month |
| 6 | 🎒 Старый студент | 100 | 7 weeks |
| 7 | 🧡 Монах | 200 | 3.5 months |
| 8 | 🏔 Отшельник | 350 | half a year |
| 9 | 🧙 Мастер | 500 | 8 months |
| 10 | 🥋 Сенсей | 750 | a year |
| 11 | 🕉 Йог | 1 000 | 1.5 years |
| 12 | 🙏 Гуру | 1 500 | 2 years |
| 13 | 👳 Гоенка | 2 000 | 3 years |
| 14 | 🪷 Бодхисаттва | 3 000 | 4 years |
| 15 | ☸️ Будда | 3 650 | 5 years |

## Personal achievements (19)

Rules for every "N days in a row": a paused day without practice freezes the run; any other day
that doesn't qualify resets it. "Check-in time" is the local time the current `done` vote was
placed; admin fixes don't count for time-based achievements but count for all others.

| Group | Achievement | Condition |
|---|---|---|
| Streaks | 🌄 Семь рассветов · 🌙 Лунный цикл · 🏞 Сто рассветов · 🌍 Вокруг Солнца | streak of 7 / 30 / 100 / 365 days |
| Full practice | 🏕 Десятидневка | 10 days in a row, morning and evening 60 min |
| | 🪨 Адхиттхана | 14 days in a row with a 60-min session |
| | ☯️ Привычка | 21 days in a row with both sessions |
| | 👳 Как завещал Гоенка | 30 days in a row, morning and evening 60 min |
| Time | 🔔 Утренний гонг | 7 days in a row, morning ≥ 30 min checked in before 07:00 |
| | ⏰ Швейцарские часы | 14 days in a row, morning ≥ 30 min, check-ins within one hour |
| | 🔕 Без напоминаний | 30 days in a row, first session checked in before the reminder |
| Character | 🧘 Первый шаг | first session ever |
| | 🐦‍🔥 Феникс | removed by the bot, came back, streak of 7 days |
| | 🧗 Новая высота | after a broken streak of 14+ days, beat the record |
| | 🗿 Кремень | at day close: ≥ 25 active days in the 30-day window, regularity ≥ 90% |
| | 🎒 Дхамма в рюкзаке | 5 sessions on paused days |
| | 🗓 Год на подушке | 365 practiced days in total |
| Secret | 🦉 Сова | 5 evening sessions checked in after midnight |
| | 🛟 Спасённый день | 5 times a "didn't practice" vote replaced by a session |

`/me` lists only the achievements already earned, with their dates; conditions of the rest live
in this file, not in the bot.

## Group achievements

Granted to the whole chat once, at day close: 🙌 Сангха в сборе (all active members, at least 5,
did both sessions), 🤝 Неделя без потерь (7 closed days in a row with no missed day),
⏳ 1 000 / 5 000 / 10 000 часов группы.

## Granting

- **After a vote** the bot evaluates closed-day aggregates plus today's sessions and grants every
  title and achievement met. One silent reply to the poll, no ping: the top title first, then
  achievements. "Первый шаг" adds a hint about the first title unless a title comes with it.
- **Pending until close.** Today's awards may still be taken back: a retracted or changed vote
  re-evaluates, removes awards that no longer hold and edits or deletes the congratulation.
  At day close they become permanent.
- **At day close** "Кремень" and group achievements are evaluated; all awards of the day appear in
  the next morning's leaderboard.
- **Where shown:** title emoji before the name in the leaderboard (sorting unchanged); weekly recap
  lists the week's awards; `/me` (private chat) shows the title with a progress bar and the earned achievements.

## Data

- `members/{userId}`: `title` (level) and `awards: { [id]: { date, pending?, messageId? } }`;
  titles are stored there too as `title:<level>`. Awards aren't part of the recomputable
  aggregates; `removedOn` marks a removal for "Феникс".
- Achievement counters are part of `MemberStats`, maintained by the `applyDay` reducer, so they
  can be rebuilt from check-ins. Check-ins remember `wasSkipped` for "Спасённый день".
- `chats/{chatId}`: `awards: { [id]: date }` and `noLossRun` for group achievements.

## Launch / maintenance

```bash
npm run recompute -- <chatId>              # rebuild stats, grant awards retroactively, silently
npm run recompute -- <chatId> --announce   # …and post "Раздача званий" once
```

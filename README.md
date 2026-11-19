# 🪷 Daily Meditation Tracker

A Telegram bot for a small group of friends who keep a daily meditation practice together —
one hour in the morning, one in the evening (Vipassana-style). It makes checking in a single
tap and turns honest records into gentle social support.

> The goal is regularity of each person's practice, not competition.

## How it works

| Time (MSK) | What happens |
|---|---|
| 04:00 | Day closes (stats final, removal rule applied), yesterday's leaderboard, morning poll |
| 16:00 | Evening poll |
| 21:30 | Pings everyone with no session today |

- **Check-in = one tap** in a non-anonymous poll: `1 час` · `30 минут` · `15 минут` ·
  `Сегодня не получилось`. Changed your mind? Retract the vote and vote again.
- **Leaderboard** sorted by practice hours over the last 30 days; each entry shows the title,
  30-day hours and regularity (sessions done / sessions possible) and the streak.
- **Live progress** in a pinned message: `☀️ Сегодня: утро 18/28 · вечер 5/28`.
- **Weekly recap** on Mondays.
- **Titles and achievements:** 15 titles by total hours (🌱 Искатель → ☸️ Будда) and 19 one-time
  achievements for real effort, congratulated right after the vote — see [docs/AWARDS.md](docs/AWARDS.md).
- **Accountability:** after 3 days in a row without practice the bot removes the member and
  DMs them a personal link to come back any time; stats are kept.
- **Pause** for retreats, illness or travel: `/pause 10 ретрит` freezes the streak.

```
🪷 Практика за вс 15 ноября
Группа: 47 из 56 сессий (84%) 🙏

1. Аня · 🎒 Старый студент
   за 30 дней: 58 ч · 96% · ср. 58 мин · 🔥 42 дня подряд

2. Боря · 🌿 Практик
   за 30 дней: 52 ч · 91% · ср. 52 мин · 🔥 17 дней подряд

3. Женя
   за 30 дней: 9 ч · 88% · ср. 18 мин · 🔥 4 дня подряд

🏅 Награды дня
Боря — 🌄 Семь рассветов, 🔔 Утренний гонг
```

## Commands

| Who | Command | Purpose |
|---|---|---|
| Everyone | `/me` | Personal stats (in the group); detailed stats in the bot's private chat |
| Everyone | `/top` | Latest leaderboard |
| Everyone | `/pause N [reason]`, `/resume` | Pause for N days / end it |
| Everyone | `/help` | Rules |
| Admin | `/setup` | Enable the bot in the group |
| Admin | `/settings [key value]` | Show or change times and rules |
| Admin | `/fix @user date slot 60\|30\|15\|remove` | Correct a record |
| Admin | `/forgive @user` | Reset the missed-days counter |
| Admin | `/pause @user N` | Pause someone else |
| Admin | `/export` | CSV of all check-ins to your DM |

## Quick start

```bash
cp .env.example .env   # BOT_TOKEN, path to the Firebase service account
npm install
npm start
```

Or with Docker: `docker compose up -d --build`.

Then add the bot to the group as an admin and send `/setup`.
Full instructions: [docs/SETUP.md](docs/SETUP.md).

## Tech

TypeScript · [grammY](https://grammy.dev) · Cloud Firestore · Luxon.
The bot is stateless: all data lives in Firestore, so the host can die without losing anything.

```
src/
  index.ts            entry point
  config.ts           env and defaults
  db.ts               Firestore collections
  stats.ts            pure aggregation (streaks, regularity, achievement counters)
  awards.ts           titles and achievements, declarative
  render.ts           all message texts
  time.ts             practice-day math (day ends at 04:00)
  handlers/           commands and Telegram events
  services/           check-ins, members, jobs, scheduler
scripts/recompute.ts  rebuild aggregates and grant awards retroactively
```

## Docs

- [Setup and deployment](docs/SETUP.md)
- [Specification](docs/SPEC.md)
- [Titles and achievements](docs/AWARDS.md)

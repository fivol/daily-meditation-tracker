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
- **Leaderboard** sorted by 30-day regularity (sessions done / sessions possible), with total
  sessions, streak and a 7-day strip. Newcomers and paused members are listed separately.
- **Live progress** in a pinned message: `☀️ Сегодня: утро 18/28 · вечер 5/28`.
- **Weekly recap** on Mondays, milestones (7/30/100-day streaks, every 100 sessions and hours).
- **Accountability:** after 3 days in a row without practice the bot removes the member and
  DMs them a personal link to come back any time; stats are kept.
- **Pause** for retreats, illness or travel: `/pause 10 ретрит` freezes the streak.

```
🪷 Практика за вс 15 ноября
Группа: 47 из 56 сессий (84%) 🙏

за 30 дней · сессий всего · серия · 7 дней
1. Аня   96%  212  🔥42  ●●●●●●●
2. Боря  91%  188  🔥17  ●●◐●●●●
3. Вика  88%   75  🔥17  ●◐●●◐●●

🏕 На паузе: Катя (ретрит, до 28.11)
🎉 Боря — 14 дней подряд без пропусков!
```

## Commands

| Who | Command | Purpose |
|---|---|---|
| Everyone | `/me` | Personal stats |
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
  stats.ts            pure aggregation (streaks, regularity, milestones)
  render.ts           all message texts
  time.ts             practice-day math (day ends at 04:00)
  handlers/           commands and Telegram events
  services/           check-ins, members, jobs, scheduler
scripts/recompute.ts  rebuild aggregates from raw data
```

## Docs

- [Setup and deployment](docs/SETUP.md)
- [Specification](docs/SPEC.md)

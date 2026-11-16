# Setup and deployment

## 1. Create the bot

1. In [@BotFather](https://t.me/BotFather): `/newbot` → name `Daily Meditation Tracker`,
   username e.g. `DailyMeditationTrackerBot`. Copy the token.
2. Optional: `/setuserpic`, `/setdescription`.

## 2. Create the Firestore database

1. [Firebase console](https://console.firebase.google.com) → *Add project*.
2. *Build → Firestore Database → Create database* (production mode, any region close to you).
3. *Project settings → Service accounts → Generate new private key*. Save the JSON as
   `service-account.json` in the project root (it is git-ignored).

The free Spark plan is enough. The bot uses only the Admin SDK, so Firestore security rules can
stay "deny all".

## 3. Configure and run

```bash
cp .env.example .env   # fill in BOT_TOKEN, optionally OWNER_ID
npm install
npm start              # or `npm run dev` for auto-reload
```

| Variable | Meaning |
|---|---|
| `BOT_TOKEN` | Token from @BotFather |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to the service account JSON |
| `OWNER_ID` | Optional. Your Telegram user id; receives a weekly CSV backup (start the bot in private first) |

The bot uses long polling, so it runs anywhere: a small VPS, a home server, Railway/Fly.io,
Cloud Run with min instances = 1. It keeps no local state — all data lives in Firestore, so the
host can be replaced at any time.

## 4. Add the bot to the group

1. The group must be a **supergroup** (any group with a public link or >200 members already is;
   otherwise enabling chat history for new members converts it).
2. Add the bot and make it an **admin** with: *Delete messages*, *Ban users*,
   *Invite users via link*, *Pin messages*. Admin rights are also required to receive
   join/leave updates.
3. As a group admin, send `/setup`. The bot pins the "today" progress message and starts the
   daily schedule.
4. Ask members to open the bot in private and press **Start** — otherwise it can't send them the
   return link if they are removed.

Members appear in the stats after their first vote or any message in the group.

## Maintenance

- **Change times / rules:** `/settings` in the group (admins).
- **Fix a record:** `/fix @user 2026-11-15 evening 60` (or `remove`).
- **Rebuild aggregates** from raw data: `npm run recompute -- <chatId> [userId]`.
- **Export:** `/export` sends a CSV of all check-ins to the admin's DM.

# Daily Meditation Tracker — Specification (v0.4)

A Telegram bot for a small group chat (≤ 30 people) whose members keep a daily Vipassana
practice: one hour in the morning and one hour in the evening. The bot makes checking in
effortless, keeps honest records, and turns them into gentle social reinforcement.

**Principle:** the goal is *regularity of each person's practice*, not competition.
Rankings exist to make it fun; the tone of every message is supportive, never shaming.

---

## 1. Core concepts

| Term | Definition |
|---|---|
| **Practice day** | A calendar day in `Europe/Moscow` with the day boundary at **04:00**, not midnight. A session finished at 01:30 counts for the previous day. |
| **Slot** | `morning` or `evening`. Max 2 sessions per person per day. |
| **Session** | A check-in with a duration of 15, 30 or 60 minutes. Any duration counts as a session; the duration is stored separately. |
| **Skip** | An explicit "не делал(а)" answer. Not a session; stored only so the bot knows the person saw the poll. |
| **Practiced day** | A day with ≥ 1 session. |
| **Missed day** | A closed day with 0 sessions while the member was active (in the chat, not paused). |
| **Active days** | Closed days since the member joined, excluding paused days and days outside the chat. |
| **Regularity** | Over the **last 30 closed days**: `sessions / (2 × active days in that window)`, shown as %. Both morning and evening count, so 100% = both sessions every day. **The leaderboard is sorted by it.** |
| **Streak** | Consecutive practiced days. Paused days freeze it (neither break nor extend). |

---

## 2. Daily rhythm (Moscow time, configurable)

| Time | Event | Notification |
|---|---|---|
| **04:00** | **Day close** (polls stopped, stats recalculated, removal rule applied), then yesterday's leaderboard + **morning poll** | silent |
| **16:00** | **Evening poll** | normal |
| **21:30** | **Reminder** pinging everyone with 0 sessions today | pings (mentions reach people even if the chat is muted) |
| **Mon 04:00** | Weekly recap added on top of the daily leaderboard | silent |

Why these times:
- Closing a day and opening the next happen at the same moment, so there is no gap: whoever
  wakes at 04:30 or sits at 00:30 always has an open poll. The day starts with "here is where we
  are" plus one tap to check in — one block of messages instead of noise throughout the day.
- 21:30 instead of 22–23: an hour-long sit still fits before sleep.
- Routine messages are silent: anyone who wants zero noise mutes the chat and still gets pinged
  by name when it actually matters.

---

## 3. Check-in: a regular non-anonymous poll

```
🌅 Утренняя практика · пн 16 ноября

○ 🧘 1 час
○ 🌿 30 минут
○ 🌱 15 минут
○ 🙏 Сегодня не получилось
```

- **Non-anonymous** ⇒ the bot receives a `poll_answer` update for every vote, and the voter list
  is visible to the group (that visibility *is* the social reinforcement).
- **Changing your mind is native Telegram:** "Retract vote" → vote again. A retraction arrives as
  a `poll_answer` with empty `option_ids`; the bot revokes the check-in. No extra commands, no
  messages in the chat.
  - Typical case: voted "не получилось" in the morning, sat at noon → retract, vote "1 час".
- Each poll is **pinned** (silently) when posted, so chat messages don't bury it, and unpinned
  at day close. After 16:00 both polls of the day are pinned; the evening one is on top.
- The poll is open from posting until **day close (04:00)**; then the bot calls `stopPoll`.
  Votes for a day that has ended are ignored, so nothing can slip in while the day is being closed.
  After that, only an admin can fix a record (`/fix`).
- The bot stores the time of every vote (and of every change).

Why not a quiz: quiz votes can't be retracted, so "не получилось" would lock a person out for the
whole day, and a misclick could not be fixed. The confetti is replaced by title and achievement congratulations
(§4.4) and the live progress line (§4.2).

---

## 4. What people see

### 4.1 Daily leaderboard (posted 04:00)

```
🪷 Практика за вс 15 ноября
Группа: 47 из 56 сессий (84%) 🙏

1. Аня · 🎒 Старый студент
   за 30 дней: 58 ч · 96% · ср. 58 мин · 🔥 42 дня подряд

2. Боря · 🌿 Практик
   за 30 дней: 52 ч · 91% · ср. 52 мин · 🔥 17 дней подряд

3. Женя
   за 30 дней: 9 ч · 88% · ср. 18 мин · 🔥 4 дня подряд
…

24. Дима
   за 30 дней: 6 ч · 41% · ср. 12 мин · ⚠️ без практики 2 дня

🏕 На паузе
Катя — ретрит, до 28.11

🏅 Награды дня
Боря — 🌄 Семь рассветов, 🔔 Утренний гонг
```

- **"Группа: 47 из 56"** — sessions the whole group did yesterday out of the maximum possible
  (28 active members × 2). One number for "how we did together".
- **Entry:** two lines — rank, name and title (if any); then hours and regularity over the last
  30 days (a single `0` when there was no practice; minutes under an hour), the streak from
  3 days on, and a warning after a missed day.
- **Last day:** a member who will be removed at the next close unless they practice today gets a
  third line in their entry, and the names are repeated in a «Последний день» block at the bottom.
- **Sorting:** practice hours in the last 30 days ↓, then 30-day regularity ↓, then total hours ↓.
  A rolling window reflects how people practice *now*: an old-timer who stopped slides down,
  someone who restarted climbs back within weeks. Newcomers are ranked like everyone else —
  their few hours put them low naturally. Paused members are listed separately.
- **Awards of the day:** one line per member with the new title and achievements.
- 30 entries (~60 lines) fit within Telegram's 4096-char limit and on a phone screen.

### 4.2 Live day progress (pinned)

One pinned message that the bot edits on every vote — just the day's totals:

```
☀️ Сегодня: утро 18/28 · вечер 5/28
```

### 4.3 Weekly recap (Monday 04:00)

Added on top of Monday's leaderboard:
- Group: total sessions and hours for the week, % of the maximum, best day.
- Everyone with a perfect week (14/14) and everyone who practiced every day.

### 4.4 Titles and achievements

Titles grow with total hours of practice; achievements are granted once for specific efforts.
Both are congratulated right after the vote and listed in the next morning's leaderboard.
Full description: [AWARDS.md](AWARDS.md).

### 4.5 Personal stats: `/me`

Reply in the chat, auto-deleted after 2 minutes (the command message is deleted too):

```
🧘 Боря · с нами 140 дней
📈 Регулярность за 30 дней: 85% (51 из 60 сессий)
📿 Сессий: 188 (утро 104 · вечер 84) · 171 ч
📅 Дней с практикой: 131 · обе практики: 81
🔥 Серия: 17 дней (рекорд — 34)
⏰ Обычно отмечаешься: утро ~07:10 · вечер ~21:40
```

`/top` re-posts the current leaderboard on demand.

### 4.6 Private chat

The private chat answers only what works there: `/start` and `/help` show the rules, and `/me`
shows detailed stats for every group the user is in — place in the leaderboard, 30- and 7-day regularity, streak and record, totals with average session length,
practiced days out of active days, today, usual check-in times, sessions by duration for 30 days
and a 30-day calendar. Other commands are silently ignored; the private command menu lists only
`/me` and `/help`.

---

## 5. Accountability rules

### 5.1 Evening reminder (21:30)

Posted only if someone has 0 sessions today; pings exactly those people:

```
🌙 Вечерняя практика ещё впереди
@vika · @gosha — сегодня пока ни одной сессии
@dima — 3-й день без практики. Если сегодня не получится,
ночью бот попрощается с тобой (вернуться можно в любой момент) 🙏
```

Users without a `@username` are mentioned via a `tg://user?id=` text mention.

### 5.2 Automatic removal after 3 missed days

- After the **3rd consecutive missed day** (at day close), the bot removes the member:
  `banChatMember` + immediate `unbanChatMember` — a kick that does *not* block rejoining.
- Message in the chat: *"Дима взял(а) паузу от чата. Возвращайся, когда будешь готов(а) 🙏"*.
- **Returning:**
  - If the member has ever pressed Start in the bot's private chat, the bot DMs them a personal
    one-time invite link (`createChatInviteLink`, `member_limit: 1`). The bot doesn't push
    people to do that; in private it only explains that everything happens in the group.
  - If they never started the bot, any member can share the group link.
- On return: all stats are kept, the streak starts from 0, days outside the chat don't count
  against regularity.
- A newcomer gets a short welcome sent as a reply to the day's current poll, so one tap on the
  quote takes them to it.
- Chat admins can't be removed by a bot — for them the rule is warning-only.
- New members: counting starts on the day they join.

### 5.2.1 Group upgrades

Telegram turns a basic group into a supergroup on some admin actions, and the chat id changes.
The bot handles the `migrate_to_chat_id` service message: it moves all data (settings, members,
check-ins, days, poll mappings) to the new id and re-creates the pinned progress message.
In basic groups a removal is a plain kick (unbanning exists only in supergroups).

### 5.3 Pause (retreats, illness, travel)

Essential for this audience: a 10-day Vipassana course means no phone at all.

- `/pause 10 ретрит` — pause for N days with an optional reason (max 21 days per pause).
- During a pause: no pings, no missed days, streak frozen, days excluded from regularity,
  shown under "🏕 На паузе".
- `/resume` ends it early; it also ends automatically.
- Admins can pause someone on their behalf (`/pause @user 10`) — e.g. someone left for a
  retreat and forgot.

---

## 6. Commands

| Who | Command | Purpose |
|---|---|---|
| All | `/me`, `/top` | Personal stats / leaderboard |
| All | `/pause N [reason]`, `/resume` | Pause |
| All | `/help` | Rules and how-to |
| Admin | `/setup` | Bind the bot to the chat, post the pinned progress message |
| Admin | `/settings [key value]` | Show or change `morning`, `evening`, `reminder`, `missLimit`, `maxPauseDays` |
| Admin | `/fix @user date slot minutes\|remove` | Correct a record (e.g. after the poll closed) |
| Admin | `/forgive @user` | Reset a member's missed-day counter |
| Admin | `/pause @user N` | Pause on someone's behalf |
| Admin | `/export` | CSV of all check-ins to the admin's DM |

Command messages in the group are deleted by the bot after handling, to keep the chat clean.

---

## 7. Technical design

### 7.1 Stack

- **TypeScript + [grammY](https://grammy.dev)**.
- **Cloud Firestore** (Firebase) as the only storage. The free Spark tier
  (50k reads / 20k writes per day, 1 GiB) is far above our needs (~60 check-ins/day).
- **Luxon** for timezone-correct day boundaries.
- **Hosting:** any small server or Cloud Run. The bot is stateless — if the server dies, it is
  redeployed elsewhere and nothing is lost.

### 7.2 Required bot permissions

- Admin in the group with: *Ban users*, *Invite users via link*, *Pin messages*, *Delete messages*.
- Group must be a supergroup.
- `allowed_updates`: `message`, `poll_answer`, `chat_member`, `my_chat_member`.

### 7.3 Data model (Firestore)

```
chats/{chatId}
  timezone, dayBoundaryHour, schedule{morning, evening, reminder},
  missLimit, maxPauseDays,
  startDate, lastClosedDate, progressMessageId,
  awards{id: date}, noLossRun                   // group achievements

chats/{chatId}/members/{userId}
  userId, firstName, lastName, username, joinedDate,
  status: active | paused | removed, pauseUntil, pauseReason,
  // aggregates over closed days, recomputable from checkins + day snapshots:
  activeDays, sessions, morningSessions, eveningSessions, minutes,
  practicedDays, fullDays, currentStreak, bestStreak, missedInRow, lastPracticeDate,
  recent: [{date, status, sessions, minutes}]   // last 30 closed days
  fullHourRun, hourRun, bothRun, gongRun, morningTimes, noReminderRun,
  pausedSessions, owlCount, rescuedCount, brokenBest   // achievement counters
  title, awards{id: {date, pending?, messageId?}}, removedOn   // see AWARDS.md, not recomputed

chats/{chatId}/checkins/{date}_{userId}_{slot}      // deterministic id ⇒ one record per slot
  userId, date, slot: morning | evening,
  status: done | skipped | revoked, minutes: 60 | 30 | 15 | null,
  firstAt, updatedAt, source: poll | admin, wasSkipped

chats/{chatId}/days/{date}
  polls{morning, evening: {messageId, pollId}},
  jobsDone{morning, evening, reminder},           // idempotency markers
  statuses{userId: active | paused | absent},     // snapshot taken at close
  awardLines[]                                    // titles/achievements of the day, for the leaderboard

polls/{pollId} → { chatId, date, slot, optionMinutes: [60, 30, 15, null] }
users/{userId} → { canDm }                         // started the bot in private
```

- `polls/{pollId}` exists because `poll_answer` updates contain only the poll id and the user,
  not the chat.
- A vote change overwrites the same check-in document (`updatedAt` changes, `firstAt` stays).
- Aggregates change only at day close: the closed day is folded into each member's stats by a
  pure reducer (`applyDay`). The `recent` window gives 30-day regularity, the 7-day strip and
  the weekly recap without extra reads.
- An admin `/fix` of a closed day replays the member's history with the same reducer.

### 7.4 Scheduler

A tick every 30 seconds. For each chat:
1. Close every finished day after `lastClosedDate` (catches up after downtime, in order).
2. Run today's jobs (`morning`, `evening`, `reminder`) that are due and not yet marked in
   `days/{date}.jobsDone`; then mark them. A reminder more than 3 hours late is skipped.

### 7.5 Reliability and backups

- Telegram API calls retry rate limits (429), server errors (5xx) and network failures
  (`@grammyjs/auto-retry`, up to 5 attempts).
- Each scheduled job sends exactly one thing and is marked done in Firestore afterwards (a poll
  together with its mapping, in one batch), so a retry never duplicates a message. Jobs that fail
  transiently are retried on the next tick; jobs Telegram refuses for good (400/403) are logged
  and skipped instead of retrying forever.
- Closing a day writes the stats and `lastClosedDate` in one batch, so a day is never counted twice.
- Logs: timestamped, to stdout and to daily files in `logs/` (30 days), mounted from the host.

- `npm run recompute -- <chatId> [userId]` rebuilds aggregates from raw data at any time.
- Weekly automatic CSV export to the owner's DM (`OWNER_ID`) — a free, independent backup.

## 8. Out of scope for v1

- Per-user timezones (everyone uses Moscow time).
- Mini App / web dashboard, charts as images.
- Reactions as a check-in method.
- Multiple groups (the data model already supports it; no UI for it).

---

## 9. Open questions

None at the moment.

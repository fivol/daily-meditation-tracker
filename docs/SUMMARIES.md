# Summaries and dashboards

Besides the daily leaderboard the bot sums up longer periods and draws dashboards. Everything
here follows one rule: **celebrate progress, never compare people.** The group is measured
against its own past, each person against their own past; names are listed alphabetically,
the pictures show people only as anonymous counts, and a dip is simply not mentioned.

## Group summaries

| Summary | Sent | Period | Compared with |
|---|---|---|---|
| Week | when Sunday closes (Monday 04:00) | Monday – Sunday | the week before |
| Month | on every monthly anniversary of the chat's first day | one month | the month before |
| Year | on every yearly anniversary | twelve months | — |

The daily leaderboard always goes first and stays as it is; each summary follows as its own
two messages — a text, then a picture. On a day when several periods end they go shortest first.

**The text** — what the group did together (sessions, hours, regularity and its growth, the
friendliest day, all hours since the first day), the joys of the period (everyone who did every
session, practiced every day, or added time against the previous period; streak counts; group
achievements), new titles and achievements, and one line per person with their own sessions
and hours.

**The picture** — a dashboard about the group as a whole, 2560 px on the long side so it reads
at a glance and can be zoomed into:

- hours together, sessions, regularity, how many practiced — each with its change;
- hours day by day, morning and evening (week by week for a year);
- the group's path: all hours since the first day and the next round milestone;
- regularity over the period against the previous one;
- when the group checks in, by hour of the day;
- the rhythm of practice: how many of us sit every day, 5–6, 3–4, 1–2 days a week;
- joys of the period as counts; session lengths, morning vs evening; titles held in the group.

A failed picture never blocks anything: it is logged and the day goes on.

`/summary week|month|year` (admins) sends the latest period's summary to the admin's private
chat — a way to look at it without posting to the group.

## Personal dashboard: `/me`

`/me` works in the bot's private chat: the detailed text, then one album (gallery) with the
dashboard and the share cards, for every group the user is in. Any other message written to the
bot in private gets the same answer. In the group `/me` posts the same album for 2 minutes,
captioned with a link that opens the detailed stats in the private chat.

The picture covers the whole time with us: total hours, sessions, streak and practiced days;
regularity rings and hours for the last 7 days, the last 30 days and all time (with growth
against the window before); a calendar of every day; hours week by week; the path to the next
title; session lengths, morning vs evening, check-in hours; achievements.

### Share cards

After the dashboard the album has one or two 4:5 cards (1080×1350 logical, made for an Instagram
feed) in a night-teal theme. They carry only what an outsider understands — no titles, no
achievements:

1. **Hours** — total hours of practice, what they compare to on a 10-day course (≈10 hours of
   sitting a day), up to four facts and the last 30 days as columns.
2. **Days** (from 21 practiced days) — days on the cushion, a calendar of the last weeks and
   two more facts.

Facts are picked per person (`shareFacts` in `src/charts/share.ts`): each candidate — streak,
average session, hour-long sessions, regularity, two-hour days, days with both sessions, record
streak, best week, sessions, practiced days — has a threshold below which it is hidden and a
score that grows with the amount; the strongest ones are shown. So nobody gets a card with zeros.

## Code

```
src/summary.ts          periods and pure aggregation (group summary, personal history)
src/services/history.ts Firestore reads for a period / for one member
src/charts/svg.ts       SVG primitives and the theme
src/charts/blocks.ts    chart blocks: columns, line, calendar, rings, bars
src/charts/group.ts     group dashboard
src/charts/personal.ts  personal dashboard
src/charts/png.ts       SVG → PNG (resvg, bundled Manrope font)
```

Morning sessions are always saffron and evening sessions indigo; "how much practice" is one
teal hue from light to dark. The pictures carry no emoji — the renderer has only the text font.

`npm run preview` renders every dashboard from made-up data into `preview/` without touching
Telegram; `npm run preview -- <chatId> [userId]` does the same from real data (read-only).

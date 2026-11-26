# Daily Meditation Tracker — working rules

## After every finished change

1. **Commit and push** to `main` (short message focused on the "why"). Never force-push.
2. **Deploy to the server** right away — the production bot runs on the `helsinki` server and is
   deployed from the sibling [infra](https://github.com/fivol/infra) checkout:

   ```bash
   cd ../infra && make deploy S=daily-meditation-tracker
   ```

   It pulls `main` on the server and rebuilds the Docker stack. Check the result with
   `make status S=daily-meditation-tracker` (or `make logs S=daily-meditation-tracker`).

Both steps are the normal end of a task — do them without asking.

## Never trigger group messages by hand

Reports, polls and summaries go out on schedule only. Do not send them to the group "to try it
out" (no `/summary` in the real chat, no one-off scripts posting there) unless explicitly asked.
To look at a dashboard, render it to a file: `npm run preview` (see `scripts/preview.ts`).

## Tone of everything the bot says

This is a meditation circle, not a competition. Summaries and dashboards celebrate the progress
of the group and of each person against their own past; they never rank or compare people.
Lists of names are alphabetical.

## Code

- Docs live in `README.md` → `docs/`; update them with user-visible changes.
- Do not run `build`, linters or formatters unless asked.

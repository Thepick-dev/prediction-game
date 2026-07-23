# Season how-to manual

Plain-language notes for the jobs that come up once a season, once a gameweek, or once in a while. This is a first draft based on reading how the site actually works — the "weekly routine" and "end of season" sections in particular are worth double-checking together during a real gameweek before fully trusting them (that's the "dress rehearsal" item still on the to-do list).

These same guides are also published as pages inside the site itself, under Admin → Help: `/admin/help/weekly` and `/admin/help/pre-season`. Keep both copies in sync if either changes.

## Weekly routine (during the season)

Most of this happens automatically. Here's what runs itself, and what to check by hand.

**Automatic, no action needed:**
- Every night, the site checks whether any gameweek's deadline has just passed. If so, it locks that gameweek and automatically fills in a pick (an "AUTOPICK") for anyone who didn't make one in time.
- After the very first gameweek's deadline of a season, everyone's "double-use team" choices get locked in permanently and can't be changed again.

**Sync players weekly while transfer windows are open:** during the summer and January transfer windows, clubs' squads change — players move between teams, new signings arrive, others leave. Click **Import Players** on `/admin/sync` once a week while a transfer window is open, so the pick lists stay accurate. Outside transfer windows this isn't needed as often since squads aren't changing.

**You need to do these by hand, after each round of matches:**
1. Go to `/admin/sync` and click **Sync Results** — this pulls in the finished scores.
2. Click **Sync Standings** — this updates the league table. Do this before the next step, since it feeds straight into it.
3. Go to `/admin/quartiles` and click **Reset to League Table** — this re-splits the 20 clubs into four difficulty bands based on the table you just synced. **This step is easy to forget.** Quartiles are only a snapshot: whatever `/admin/quartiles` says at the exact moment you mark a gameweek "completed" is what gets locked in and used for that week's scoring, permanently. Skip this step and that week quietly scores against old, stale bands instead of the current table.
4. Go to `/admin/events` (Match Events), pick this gameweek, and click **Sync from FPL** — this fills in goalscorers, assists, own goals and scores automatically by pulling from the Fantasy Premier League API. Wait roughly an hour after the gameweek's last match finishes before doing this: that's how long FPL takes to fully confirm a match (their bonus-points review holds things back briefly, though goals/assists themselves are accurate at full time). If you click it too early it just skips whatever isn't confirmed yet rather than pulling anything wrong, so there's no harm trying and re-clicking later.
5. Go to `/admin/gameweeks`, find the gameweek, and set its status to **completed**. This is the step that actually calculates points — it takes the quartile snapshot from step 3 and works out everyone's points from the results and any goals/assists. (`/admin/scoring` is a different page — it only edits the points formula itself, it doesn't calculate anything.)
6. Spot-check the Leaderboard page — does it look right?

**If a goal or assist was wrong:** go back to `/admin/events`, pick the gameweek, and click **Sync from FPL** again — it replaces that gameweek's events with a fresh pull rather than piling on top, so it's always safe to re-run. You can also add or delete individual events by hand on that same page for a manual correction FPL wouldn't reflect (e.g. a data error on their end).

**If something looks wrong with a result or a goal that got added late:** once the events are right, use the "Recalculate Scoring" box on `/admin/sync` to re-run scoring for that gameweek — safe to run as many times as you need, it always recalculates from scratch rather than adding on top of last time. This does *not* refresh the quartile snapshot from step 3, though — if the quartiles themselves were wrong for that week, that needs fixing separately.

## Pre-season checklist

### Code changes you can make yourself

Three things live in the site's actual code rather than any admin page, but you don't need Claude to change
them — here's exactly how.

**How to make any of these edits, in general:**
1. Open the project in VS Code.
2. Press `Ctrl+P` (Mac: `Cmd+P`) — a search box appears at the top.
3. Type the file name (given below for each change) and press Enter — that exact file opens.
4. Press `Ctrl+F` and paste in the text shown below to jump straight to the right line.
5. Change **only** the specific part described — leave everything else on the line exactly as-is (spacing, commas, and quote marks all matter).
6. Save with `Ctrl+S`.
7. Once you've made all the edits for one change, publish them: click the Source Control icon in the far-left sidebar (looks like a branch with dots). Type a short message at the top, e.g. "Update season year", click the checkmark to commit, then click **Sync Changes** to push it live. The live site updates automatically within a minute or two.

**1. The season year (4 files).** Each fetches data from football-data.org for a specific season, written as the year that season *starts* — e.g. the 2027-28 season is `2027`. All four need updating at the start of a new season, or the site keeps quietly pulling last season's data forever.

- File: `app/api/sync/teams/route.ts` — one spot:
  ```
  'https://api.football-data.org/v4/competitions/PL/teams?season=2026',
  ```
- File: `app/api/sync/fixtures/route.ts` — two spots:
  ```
  'https://api.football-data.org/v4/competitions/PL/matches?season=2026',
  season: '2026'
  ```
- File: `app/api/sync/standings/route.ts` — two spots:
  ```
  'https://api.football-data.org/v4/competitions/PL/standings?season=2026',
  season: '2026'
  ```
- File: `app/api/sync/results/route.ts` — three spots:
  ```
  'https://api.football-data.org/v4/competitions/PL/matches?season=2026&status=FINISHED',
  message: 'No finished matches yet for 2026 season'
  season: '2026'
  ```

Change every `2026` above to the new year.

**2. Adding a promoted club's short code.** First find the club's official 3-letter FPL code (check the Fantasy Premier League website/app's team list, or ask Claude to look it up). Then open `app/api/sync/fpl/route.ts` and find this block near the top:

```js
const FPL_CODE_TO_OUR_SHORT_NAME: Record<string, string> = {
  ARS: 'Arsenal',
  AVL: 'Villa',
  ...
  WOL: 'Wolves',
}
```

Add one new line inside the `{ }` braces, before the closing brace — e.g. for Coventry:

```js
  COV: 'Coventry',
```

The right-hand side (in quotes) must exactly match that club's **Short Name** as shown on `/admin/teams` — check there if you're not sure of the exact spelling. Don't forget the trailing comma.

*Coventry, Hull and Ipswich's codes (`COV`, `HUL`, `IPS`) are already added for the 2026/27 season* — but FPL's own site hadn't switched over to the new season's team list yet when these were added, so they're a best-confidence guess, not yet confirmed against real data. After running Import Players once FPL updates, check the result message doesn't list any of the three under "unmapped teams" — if it does, the guessed code was wrong for that club and needs a one-line fix here.

**3. Adding new hero background images.**
1. Add the new image files into `private/hero-images/` (note: `private/`, not `public/` — images live outside the public folder on purpose so only logged-in visitors can see them), following the existing naming pattern — if the last one is `hero-04`, your new ones are `hero-05-desktop.png` and `hero-05-mobile.png`.
2. Open `components/HeroPage.tsx` and find:
   ```js
   const TOTAL_HEROES = 4
   ```
   Change `4` to however many pairs of images you now have in total.
3. Save and publish using the steps above. This can be done any time, not just pre-season.

### Everything else

- **Check the outside player data is ready before syncing.** We pull player info (names, positions, which club they're at) from the Fantasy Premier League website. Every summer, after promotion and relegation, it takes them a little while to update their team list. If a club is missing after you click "Import Players" on `/admin/sync`, it's usually because of this — see the To-do list (`docs/TODO.md`) for the current status (Coventry, Hull, Ipswich for 2026/27 — their codes are already in the code, just waiting on FPL's own data to catch up).
- **Mark relegated clubs as "inactive" and promoted clubs as "active"** on the Teams admin page (`/admin/teams`), so players can't accidentally pick a team that's no longer in the competition. For the 2026/27 season specifically: turn on Coventry, Hull and Ipswich; turn off West Ham, Burnley and Wolves (2025/26's relegated three).
- **Set up the new competition** at `/admin/competitions` (name, dates, mark it "active").
- **Add the deadlines for each gameweek** at `/admin/gameweeks`.
- **Import fixtures** via `/admin/sync` ("Import Fixtures"), then check they've landed in the right gameweeks at `/admin/fixtures`.
- **Set pre-season league positions** using the manual override editor at `/admin/standings` — since there are no real results yet, this is where you'd enter odds-based or predicted starting positions. Important: once you start syncing real standings during the season, don't go back and manually override again, or the next automatic sync will just overwrite your manual entry anyway.
- **Set the scoring quartiles** at `/admin/quartiles` (splits teams into four bands of difficulty — used to work out how many points a result is worth) and **the draft tiers** at `/admin/draft-tiers` (separate from quartiles — this is what players pick their "double-use" team from).

## End of season / new season team updates

- Newly relegated clubs: mark "inactive" on `/admin/teams`.
- Newly promoted clubs: mark "active" on `/admin/teams` (add them first via Sync if they're not already in the list).
- Re-run the pre-season checklist above for quartiles, draft tiers, and standings — these need setting fresh each season, they don't carry over automatically.
- Old competition: leave its `status` as-is (not "active") so it drops out of the live Leaderboard/Picks pages but stays visible in the Archive.

Adding new hero background images can be done any time, not just end-of-season — see "Code changes you can make yourself" above.

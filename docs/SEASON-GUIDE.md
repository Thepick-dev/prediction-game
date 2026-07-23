# Season how-to manual

Plain-language notes for the jobs that come up once a season, once a gameweek, or once in a while. This is a first draft based on reading how the site actually works — the "weekly routine" and "end of season" sections in particular are worth double-checking together during a real gameweek before fully trusting them (that's the "dress rehearsal" item still on the to-do list).

These same guides are also published as pages inside the site itself, under Admin → Help: `/admin/help/weekly` and `/admin/help/pre-season`. Keep both copies in sync if either changes.

## Weekly routine (during the season)

Most of this happens automatically. Here's what runs itself, and what to check by hand.

**Automatic, no action needed:**
- Every night, the site checks whether any gameweek's deadline has just passed. If so, it locks that gameweek and automatically fills in a pick (an "AUTOPICK") for anyone who didn't make one in time.
- After the very first gameweek's deadline of a season, everyone's "double-use team" choices get locked in permanently and can't be changed again.

**Sync players weekly while transfer windows are open:** during the summer and January transfer windows, clubs' squads change — players move between teams, new signings arrive, others leave. Click **Import Players** on `/admin/sync` once a week while a transfer window is open, so the pick lists stay accurate. Outside transfer windows this isn't needed as often since squads aren't changing.

**The weekly cycle, in order.** The important thing to understand: **quartiles for a gameweek must be set BEFORE that gameweek opens for picking**, not afterwards — players need to see the actual bands (which team is the "underdog", worth more points) while they're choosing. So this cycle always sets up the NEXT gameweek's quartiles as the last step of closing out the CURRENT one, not as a separate later job. If you ever find yourself resetting quartiles on a gameweek that's already open for picking, something's out of order.

1. Go to `/admin/sync` and click **Sync Results** — this pulls in the finished scores for the gameweek that just finished.
2. Click **Sync Standings** — this updates the league table with those results. Do this before the next step, since it feeds straight into it.
3. Go to `/admin/events` (Match Events), pick that gameweek, and click **Sync from FPL** — this fills in goalscorers, assists, own goals automatically by pulling from the Fantasy Premier League API. Wait roughly an hour after the gameweek's last match finishes before doing this: that's how long FPL takes to fully confirm a match (their bonus-points review holds things back briefly, though goals/assists themselves are accurate at full time). If you click it too early it just skips whatever isn't confirmed yet rather than pulling anything wrong, so there's no harm trying and re-clicking later.
4. Go to `/admin/gameweeks`, find that gameweek, and set its status to **completed**. This is the step that actually calculates points — it takes a permanent snapshot of whatever quartile bands are *currently* set and works out everyone's points from the results and any goals/assists against that snapshot. (`/admin/scoring` is a different page — it only edits the points formula itself, it doesn't calculate anything.) This is exactly why step 6 below has to come *after* this, not before — the snapshot needs to match what players actually picked against (the old bands), not the ones about to be set for next week.
5. Spot-check the Leaderboard page — does it look right?
6. Now go to `/admin/quartiles` and click **Reset to League Table** — this re-splits the 20 clubs into four difficulty bands based on the table you synced in step 2. **This is what players picking the NEXT gameweek will see and use**, so it needs doing before that gameweek opens — ideally right away, as the last step of this cycle. **This step is easy to get wrong** — skip it, or do it too late, and the next gameweek opens with stale bands from two gameweeks ago instead of the current table.

**One thing to avoid:** once a gameweek is open for picking, don't touch `/admin/quartiles` again until it's locked and completed (step 4) — whatever the bands say at the exact moment you mark it completed is what gets frozen and scored, so changing them mid-week would mean players are scored against different bands to the ones they actually saw when picking.

**If a goal or assist was wrong:** go back to `/admin/events`, pick the gameweek, and click **Sync from FPL** again — it replaces that gameweek's events with a fresh pull rather than piling on top, so it's always safe to re-run. You can also add or delete individual events by hand on that same page for a manual correction FPL wouldn't reflect (e.g. a data error on their end).

**If something looks wrong with a result or a goal that got added late:** once the events are right, use the "Recalculate Scoring" box on `/admin/sync` to re-run scoring for that gameweek — safe to run as many times as you need, it always recalculates from scratch rather than adding on top of last time. This does *not* refresh the quartile snapshot from step 4, though — if the quartiles themselves were wrong for that week, that needs fixing separately.

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

**3. Adding new hero background images.** The pool is currently empty (`TOTAL_HEROES = 0`) — every page just shows the plain dark background until this is done.
1. Crop two versions of each new photo — a wide landscape one for desktop, a taller portrait one for mobile (they're shown with `background-size: cover`, so exact pixel dimensions aren't critical, just the general shape). Photopea or any image editor works fine.
2. Add the files into `private/hero-images/` (note: `private/`, not `public/` — images live outside the public folder on purpose, served only through a login-checked route, so nothing here is ever reachable or reverse-image-searchable without an account). Name them `hero-01-desktop.png` / `hero-01-mobile.png`, `hero-02-desktop.png` / `hero-02-mobile.png`, and so on.
3. Open `components/HeroPage.tsx` and find:
   ```js
   const TOTAL_HEROES = 0
   ```
   Change `0` to however many numbered pairs you've added — this is what actually turns the photos on.
4. Save and publish using the steps above. This can be done any time, not just pre-season.

**Two pages are photo-free on purpose and always will be**, regardless of `TOTAL_HEROES`: Login and the individual News article page (`app/login/page.tsx` and `app/news/[slug]/page.tsx`) both pass `noImage` explicitly, since those are reachable without logging in — nothing photo-based should ever be servable to a logged-out visitor. Don't remove that prop from either page.

**The Trophy Room (`/archive`) uses its own single fixed image, not the rotating pool.** Add `hero-trophy-desktop.png` and `hero-trophy-mobile.png` to the same folder (no numbering, no `TOTAL_HEROES` change needed) and it'll pick them up automatically — the page passes `heroOverride="trophy"` to `HeroPage` instead of using a random pick.

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

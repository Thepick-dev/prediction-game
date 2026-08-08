// Single source of truth for the rules WORDING shared between the real
// /rules page and the login page's RulesModal preview — the scoring
// NUMBERS were already unified (both read the same database tables, one
// directly, one via /api/public/rules-summary), but this prose used to be
// hand-copied in both places and could silently drift out of sync. Edit
// it here once and both surfaces pick it up immediately.
export const RULES_TEXT = {
  competition: [
    'The competition runs for roughly half a Premier League season — two competitions per season. Join before the first gameweek deadline. Late entries are not permitted.',
    'The player with the most points at the end of the competition wins.',
  ],
  tierDraft: [
    'Before joining, pick one team from each tier. These are your double-use teams — usable twice during the competition instead of once.',
    'Tier picks are visible to all players and locked after the first gameweek deadline.',
  ],
  weeklyPicks: [
    'Each gameweek, pick one team and two different players before the deadline. Each team is usable once (twice for tier picks). Each player is usable twice per competition.',
    'Picks can be edited until the deadline, then locked and visible to everyone. Miss the deadline and you receive an autopick — see below for how that works.',
  ],
  autopick: [
    "Miss the deadline and the site picks for you automatically: the lowest-placed available team in the league table, and two players who haven't already been used twice.",
    'Players are drawn from those valued at £5.5m or more on Fantasy Premier League — a deliberately recognisable pool of well-known names, not a random pick from the entire player list.',
    'Autopicks are marked clearly wherever they appear, and a banker is never applied to one.',
    "If an autopicked team or player has a double gameweek, the pick defaults to whichever of the two matches is against the higher-placed opponent — the tougher game, in keeping with the rest of the scoring rewarding an upset. This only applies to autopick: if you pick a double-gameweek team or player yourself, you choose the match it's for.",
  ],
  banker: [
    'Two bankers per competition. A banker doubles your entire gameweek score — team and both players. Declare it with your pick. Unused bankers are worth nothing. Bankers are never applied to autopicks.',
  ],
  allOrNothing: [
    "Once per competition, you can play All or Nothing on one of your two weekly picks — but only a player you haven't used at all yet this competition. Nominate them when you submit that gameweek's pick. Can be played alongside a banker or on its own.",
    "If they score a goal or register an assist that gameweek, you get a bonus third use of them for the rest of the competition. If they don't, you lose all remaining uses of them — for the rest of the competition, even if you'd normally have had a second go.",
  ],
  quartiles: [
    'The 20 Premier League clubs are divided into four quartiles of five — Q1 (strongest) to Q4 (weakest). Quartiles are used to calculate team points based on the difficulty of the result.',
    "Betting odds set the quartiles for the first 6 gameweeks of a brand new season, before there's enough of a real league table to go on. From gameweek 7 onward, the actual table takes over. A competition starting partway through a season (e.g. a second half beginning in January) uses the real table from its very first gameweek, since one already exists by then.",
    'Quartiles are locked at the point each gameweek deadline passes — past scores are never affected by future quartile changes.',
  ],
  scoringIntro: "Team points depend on the result and the quartile differential between your team and their opponent. ↑ means your team is the underdog, ↓ means favourite. Bigger upsets, bigger points.",
  tiebreakers: [
    'Total points',
    'Points with banker multiplier removed',
    'Highest score in a single gameweek (banker included)',
    'Most away wins from picked teams',
    'Most goals from picked players',
    'Earliest competition entry',
  ],
}

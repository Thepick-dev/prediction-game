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
    "If a picked player doesn't play at all that gameweek (injured, benched, rested, transferred), the pick still counts as one of their two uses and scores zero for them — the same applies to a Bonus Card play, below.",
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
    'All or Nothing can only ever be played on one of your own two weekly picks — never on the Bonus Card, below.',
  ],
  bonusCard: [
    "Some competitions have a Bonus Card — one nominated player, chosen by the admin, that every entrant can play once across the whole competition, in any gameweek of their choosing, up until that gameweek's normal deadline.",
    "The card's points are calculated exactly like a normal player pick (goals and assists) and are added on top of your normal team and two player picks that gameweek — nothing is replaced, and a banker never applies to the card's points, even if you also play a banker that same week.",
    "You can't play the card in a gameweek where its player is already one of your own two picks that same week — using the card on a player you've picked normally in a different gameweek is fine. Playing the card doesn't count towards that player's own separate two-uses-per-competition cap.",
    "If the nominated player doesn't play at all that gameweek, the card still counts as used and scores zero. The card's points don't count towards the best-single-gameweek tiebreaker below.",
  ],
  futzy: [
    "Futzy (AI) plays by the same rules as everyone else — the same deadlines, the same team/player usage caps, and (where enabled) Banker, All or Nothing and the Bonus Card too — but can never be crowned the winner, even if he tops the table.",
  ],
  discipline: [
    "Admin can issue a yellow or red card for any conduct they judge worthy of one — it's their call, not a fixed offense list. Appeals go through the Sporting Panel.",
    "A straight red costs you a gameweek (admin can lengthen this for serious conduct). Two yellow cards also cost you a gameweek — and once two yellows combine into a suspension, the count resets, so a future yellow starts fresh.",
    "A suspended gameweek scores zero, but nothing else is lost — your team, player, Banker and Bonus Card uses are all untouched, since you simply don't get a pick that week. You also can't play All or Nothing or the Bonus Card in a suspended gameweek, but neither use is wasted — both remain available for a later one.",
    "Suspensions escalate: a 2nd suspension costs two gameweeks, and so on. Yellow/red cards and any active suspension show next to your name on the Leaderboard — click for the reason.",
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

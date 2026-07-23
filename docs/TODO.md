# To-do list

A running list of small jobs we know about but aren't doing right this second.

## Before the season starts / next player sync
- **Coventry, Hull and Ipswich's codes are already added** (COV, HUL, IPS) — but the outside source we pull player data from (the Fantasy Premier League website) still hasn't switched over to the new season's team list yet, so these haven't been tested against real data. Once FPL updates (usually not long before the season starts), run Import Players as normal and check the result message doesn't list any of the three under "unmapped teams" — if it does, ping Claude, the code guessed for that club was wrong and needs a one-line fix.
- **Toggle team active/inactive status for the promoted/relegated clubs**, via Admin → Teams, once the above sync has run successfully:
  - Turn **on**: Coventry City, Hull City, Ipswich Town
  - Turn **off**: West Ham, Burnley, Wolves (relegated at the end of 2025/26)

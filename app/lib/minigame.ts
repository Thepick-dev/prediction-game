// Shared between components/PenaltyShootout.tsx (the client-side game) and
// app/api/minigame/score/route.ts (the server route that verifies a
// submitted score before it's allowed to overwrite anyone's best). The
// server route is the actual authority — this constant just has to stay
// in sync with the client's own scoring model (BASE_HIT_PTS/BONUS_HIT_PTS)
// so a real high score is never rejected.
export const MINIGAME_MAX_SCORE = 99

// Punitive locks — a user id here can never write a new minigame score,
// full stop, regardless of what they submit or how legitimate it looks.
// Currently one entry: majoringram inflated their own score twice (first
// to 69696969 by calling the old unvalidated write directly, then to
// exactly 99 — the range-check ceiling — once that hole was closed but
// no session/timing verification existed yet). Locked at -50 rather than
// removed entirely so it reads as a visible penalty, not a blank space.
export const MINIGAME_LOCKED_USERS: Record<string, number> = {
  '9a427e30-c412-4729-a10b-de87b8c77c7d': -50, // majoringram
}

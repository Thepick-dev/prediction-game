// Shared between components/PenaltyShootout.tsx (the client-side game) and
// app/api/minigame/score/route.ts (the server route that verifies a
// submitted score before it's allowed to overwrite anyone's best). The
// server route is the actual authority — this constant just has to stay
// in sync with the client's own scoring model (BASE_HIT_PTS/BONUS_HIT_PTS)
// so a real high score is never rejected.
export const MINIGAME_MAX_SCORE = 99

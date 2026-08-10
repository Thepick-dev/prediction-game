'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '../app/lib/supabase'

// Not connected to the prediction game in any way — purely a bit of fun,
// separate scoring, separate table.
//
// Scoring model (v4 — "chaos" pass): points, not a streak count. Every hit
// scores 2-7 points depending on how close to the CENTRE of the target
// zone you hit. 3 lives to start (up to 5 via hearts, see below), not
// sudden death on the first miss.
//
// Difficulty layers, stacked:
// - the marker always sweeps, starting each round at a random phase (no
//   fixed rhythm to memorise)
// - the target zone itself starts drifting on its own independent,
//   ever-quickening cycle past an early threshold
// - score ticks down 1/point/every half-second while you're deciding —
//   dawdling costs you, and it can push the score negative
// - past the harder stretch, rounds occasionally swap the one brutal zone
//   for TWO wider ones instead (hit either) — a deliberate breather, not
//   guaranteed every round
// - a bonus pickup sometimes appears — a heart grants a life back (capped
//   at 5), gold is worth extra points — mutually exclusive per round.
//   Randomly embedded inside the real target, sitting elsewhere on the
//   track entirely, or drifting on its own independent path — and always
//   hittable on its own: grazing it without hitting the real target still
//   banks the reward and does NOT cost a life (skull excepted, below).
// - past a threshold, a separate skull patch can appear near (never
//   overlapping) the real target — hit it and it's instant game over
const BASE_WIDTH = 30
const MIN_WIDTH = 5
const BASE_DURATION = 1.15
const MIN_DURATION = 0.28
// How much faster than a straight line the difficulty ramps — < 1 means
// real difficulty arrives earlier in the 0-99 range, not just at the end.
const CURVE_EXP = 0.75
const BASE_HIT_PTS = 2
const BONUS_HIT_PTS = 5
const MAX_SCORE = 99
const STARTING_LIVES = 3
const MAX_LIVES = 5
const MILESTONES = [25, 50, 75]
// +/- this fraction, applied fresh every round.
const JITTER = 0.3
// Kept in sync with globals.css's .pop-shoot-sweep keyframe by hand (it
// animates left: 0% -> 95%, i.e. 100 - this value) — the sweep path is a
// static CSS animation for smooth GPU-composited motion, so it can't read
// this constant directly.
const MARKER_WIDTH = 5
// Hit tests get a small forgiving margin either side of the marker's
// dead-centre, rather than requiring the exact centre point to land
// inside a zone — a fast-moving marker read at the instant of a click
// can be a percent or two off from what the eye perceived by the time
// the click actually registers, and this absorbs that without loosening
// the difficulty curve itself.
const HIT_TOLERANCE = 1.5

// The zone stays put until you're this far toward 99 — the first chunk of
// the game is deliberately still "just" a fast-narrowing static target,
// so the opening points stay easy, matching "1 should be super easy".
const ZONE_MOVE_START_T = 0.1
const ZONE_MOVE_BASE_MS = 2200
const ZONE_MOVE_MIN_MS = 420

// Lose a point every half-second while you're aiming — pure urgency,
// encourages shooting on instinct instead of stalling for the "perfect"
// moment.
const TICK_MS = 500

// Two friendlier zones instead of one brutal one, occasionally, once
// things are properly fast — a deliberate breather stage, not a reward
// for skill, so it's random whether any given late-game round gets it.
// The chance itself tapers down through the 60s/70s/80s rather than
// staying flat all the way to 99 — a few relief rounds help, too many
// undercuts the climb to a genuinely hard finish.
const MULTI_TARGET_START_T = 0.55
const MULTI_TARGET_CHANCE_BASE = 0.2
const MULTI_TARGET_CHANCE_MIN = 0.06

// Bonus pickup, single-target rounds only. Mutually exclusive per round —
// only one of the two can show up.
const HEART_CHANCE = 0.18
const GOLD_CHANCE = 0.12
// How the pickup relates to the real target this round: embedded inside
// it (tracks its movement, since it's rendered as an actual DOM child of
// the zone), sitting apart from it, or sitting apart AND drifting on its
// own separate cycle. Rolled against these cumulative thresholds.
const BONUS_EMBEDDED_MAX = 0.4
const BONUS_SEPARATE_STATIC_MAX = 0.7

// Separate danger patch, never overlapping a real zone — instant game
// over regardless of lives remaining.
const SKULL_START_T = 0.3
const SKULL_CHANCE = 0.28

// The goal box's border starts cycling colour past this difficulty, and
// the screen-shake gets punchier — purely a "this is getting unhinged"
// visual cue, no gameplay effect.
const CHAOS_VISUAL_START_T = 0.5

// The goal photo (shootout-goal.png) has real sky/grass margin either side
// of the actual goal frame rather than the frame filling the whole image —
// measured directly off the artwork. Every horizontal position drawn on
// top of that photo (ball, keeper) is mapped through this so nothing ever
// visually lands outside the goal mouth, in the grass or sky.
const GOAL_ASPECT = '1375 / 768'
const GOAL_LEFT_PCT = 13.5
const GOAL_RIGHT_PCT = 86.5
function toGoalX(pct: number) {
  return GOAL_LEFT_PCT + (pct / 100) * (GOAL_RIGHT_PCT - GOAL_LEFT_PCT)
}

// Emoji reaction tier, purely cosmetic — scaled to how precise the hit was.
function reactionEmoji(precision: number) {
  if (precision >= 0.85) return '🔥'
  if (precision >= 0.6) return '💥'
  if (precision >= 0.3) return '⚽'
  return '✅'
}

type Phase = 'ready' | 'aiming' | 'result' | 'gameover' | 'win'
type ZoneMove = { a: number; b: number; durationMs: number; phaseMs: number } | null
type Band = { left: number; width: number }
// 'embedded': band is a % of the ZONE's own width (rendered as its DOM
// child, so it automatically tracks the zone if the zone drifts).
// 'separate': band is a % of the TRACK, rendered as its own element that
// can optionally carry its own independent drift (`move`).
type Bonus = { kind: 'heart' | 'gold'; mode: 'embedded' | 'separate'; band: Band; move: ZoneMove } | null

export default function PenaltyShootout({ userId, isAdmin = false }: { userId: string; isAdmin?: boolean }) {
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(STARTING_LIVES)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<'goal' | 'miss' | null>(null)
  const [zones, setZones] = useState<Band[]>([{ left: 40, width: BASE_WIDTH }])
  const [multiTarget, setMultiTarget] = useState(false)
  const [zoneMove, setZoneMove] = useState<ZoneMove>(null)
  const [bonus, setBonus] = useState<Bonus>(null)
  const [skull, setSkull] = useState<Band | null>(null)
  const [skullHit, setSkullHit] = useState(false)
  const [duration, setDuration] = useState(BASE_DURATION)
  const [markerPhaseMs, setMarkerPhaseMs] = useState(0)
  const [difficultyT, setDifficultyT] = useState(0)
  // Where the last shot actually landed (0-100, aim-track space) — used to
  // place the ball/keeper visually, instead of the zone's centre, so what
  // you see always matches what you clicked.
  const [shotX, setShotX] = useState(50)
  // Bumped every round — used as the marker's React key (forces its CSS
  // animation to restart cleanly for the new round's duration instead of
  // re-mapping elapsed time onto it, which used to make it jump), and to
  // retrigger the zone's movement effect.
  const [roundId, setRoundId] = useState(0)
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([])
  const [justBeatBest, setJustBeatBest] = useState(false)
  // Last hit's reward — drives the floating "+N" / emoji feedback.
  const [lastHit, setLastHit] = useState<{ points: number; precision: number; key: number; bonus: 'heart' | 'gold' | null; label: string } | null>(null)
  const [milestone, setMilestone] = useState<{ text: string; key: number } | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  // There's no dedicated diving-keeper artwork — the "dive" is the same
  // standing keeper image, rotated in CSS to fake a lunge. Only on the
  // FINAL miss (lives run out) does he switch to the violin taunt — with
  // up to 5 lives now, doing that on every single miss would get old fast.
  const [showViolin, setShowViolin] = useState(false)
  // Admin-only difficulty preview — jumping the score straight to a
  // target so a difficulty tier can be checked without having to
  // actually be good enough to reach it by playing. Once used, this run
  // can never save to the real leaderboard — otherwise it'd just be a
  // way to fake a best score.
  const [testModeUsed, setTestModeUsed] = useState(false)

  const trackRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const zoneAnimRef = useRef<Animation | null>(null)
  const bonusRef = useRef<HTMLDivElement>(null)
  const bonusAnimRef = useRef<Animation | null>(null)
  const supabase = createClient()

  useEffect(() => { loadScores() }, [])

  // Drives the zone's own drift once it's meant to be moving — a real Web
  // Animation rather than a static CSS keyframe, since its start/end
  // points are randomised fresh every round and can't be hardcoded in a
  // stylesheet. Only relevant in single-target rounds — multi-target zones
  // are always static (the extra zone is itself the difficulty relief).
  // Paused/resumed by the phase effect below, cancelled and replaced
  // whenever a new round starts.
  useEffect(() => {
    if (!zoneRef.current) return
    zoneAnimRef.current?.cancel()
    zoneAnimRef.current = null
    if (zoneMove) {
      const anim = zoneRef.current.animate(
        [{ left: `${zoneMove.a}%` }, { left: `${zoneMove.b}%` }],
        { duration: zoneMove.durationMs, iterations: Infinity, direction: 'alternate', easing: 'linear' }
      )
      anim.currentTime = zoneMove.phaseMs
      if (phase !== 'aiming') anim.pause()
      zoneAnimRef.current = anim
    }
    return () => { zoneAnimRef.current?.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  // Same idea for a bonus pickup that's drifting on its own separate path
  // (mode: 'separate', with a `move`) — deliberately a distinct Animation
  // from the zone's, so the two are never in sync.
  useEffect(() => {
    if (!bonusRef.current) return
    bonusAnimRef.current?.cancel()
    bonusAnimRef.current = null
    if (bonus?.mode === 'separate' && bonus.move) {
      const anim = bonusRef.current.animate(
        [{ left: `${bonus.move.a}%` }, { left: `${bonus.move.b}%` }],
        { duration: bonus.move.durationMs, iterations: Infinity, direction: 'alternate', easing: 'linear' }
      )
      anim.currentTime = bonus.move.phaseMs
      if (phase !== 'aiming') anim.pause()
      bonusAnimRef.current = anim
    }
    return () => { bonusAnimRef.current?.cancel() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])

  useEffect(() => {
    if (zoneAnimRef.current) {
      if (phase === 'aiming') zoneAnimRef.current.play()
      else zoneAnimRef.current.pause()
    }
    if (bonusAnimRef.current) {
      if (phase === 'aiming') bonusAnimRef.current.play()
      else bonusAnimRef.current.pause()
    }
  }, [phase])

  // The time-penalty tick — only runs while you're actually deciding.
  // Re-armed every round via the phase dependency, and a functional
  // update so it's never fooled by a stale closure of `score`.
  useEffect(() => {
    if (phase !== 'aiming') return
    const id = setInterval(() => setScore(s => s - 1), TICK_MS)
    return () => clearInterval(id)
  }, [phase])

  async function loadScores() {
    const { data } = await supabase
      .from('minigame_penalty_scores')
      .select('best_score')
      .eq('user_id', userId)
      .single()
    setBestScore(data?.best_score ?? 0)

    // Deliberately its own query, separate from the personal-best lookup
    // above — if the leaderboard join ever has a problem, it should only
    // mean no leaderboard shows, never take the player's own score with it.
    const { data: top } = await supabase
      .from('minigame_penalty_scores')
      .select('best_score, profiles(display_name)')
      .order('best_score', { ascending: false })
      .limit(5)
    setLeaderboard(
      (top ?? []).map((row: any) => ({
        name: row.profiles?.display_name ?? 'Player',
        score: row.best_score,
      }))
    )
  }

  function newRound(currentScore: number, currentLives: number) {
    const t = Math.max(0, Math.min(1, currentScore / MAX_SCORE))
    const tEff = Math.pow(t, CURVE_EXP)
    setDifficultyT(t)

    const widthJitter = 1 + (Math.random() - 0.5) * JITTER
    const singleWidth = Math.max(MIN_WIDTH, (BASE_WIDTH - tEff * (BASE_WIDTH - MIN_WIDTH)) * widthJitter)

    // Tapers from MULTI_TARGET_CHANCE_BASE right as relief rounds start
    // becoming possible, down to MULTI_TARGET_CHANCE_MIN by the time
    // you're near 99 — rarer the harder the game gets, not a flat rate
    // the whole way.
    const multiT = Math.min(1, Math.max(0, (t - MULTI_TARGET_START_T) / (1 - MULTI_TARGET_START_T)))
    const multiChance = MULTI_TARGET_CHANCE_BASE - (MULTI_TARGET_CHANCE_BASE - MULTI_TARGET_CHANCE_MIN) * multiT
    const useMulti = t > MULTI_TARGET_START_T && Math.random() < multiChance
    let newZones: Band[]
    if (useMulti) {
      // Wider than the single-zone equivalent at this difficulty — the
      // extra target IS the relief, not just more surface area. Scaled
      // as a multiple of singleWidth (not a flat cap) so the relief
      // stays proportionally the same "easier than usual" at every
      // difficulty level, instead of the flat cap quietly stopping it
      // from shrinking much past the mid-game.
      const mtWidth = Math.min(BASE_WIDTH * 0.9, singleWidth * 1.2)
      const gap = 10
      const firstLeft = Math.random() * Math.max(0, 100 - mtWidth * 2 - gap)
      const secondMin = firstLeft + mtWidth + gap
      const secondLeft = Math.min(100 - mtWidth, secondMin + Math.random() * Math.max(0, 100 - mtWidth - secondMin))
      newZones = [{ left: firstLeft, width: mtWidth }, { left: secondLeft, width: mtWidth }]
    } else {
      const left = Math.random() * (100 - singleWidth)
      newZones = [{ left, width: singleWidth }]
    }
    setZones(newZones)
    setMultiTarget(useMulti)

    // Bonus pickup — single-target rounds only, so hit-detection against
    // it never has to reason about which of several zones it's near.
    let newBonus: Bonus = null
    if (!useMulti) {
      const z = newZones[0]
      const roll = Math.random()
      const isHeart = currentLives < MAX_LIVES && roll < HEART_CHANCE
      const isGold = !isHeart && roll < HEART_CHANCE + GOLD_CHANCE
      if (isHeart || isGold) {
        const modeRoll = Math.random()
        const kind: 'heart' | 'gold' = isHeart ? 'heart' : 'gold'
        if (modeRoll < BONUS_EMBEDDED_MAX) {
          // Embedded — a % of the ZONE's own width, rendered as its DOM
          // child so it rides along automatically if the zone drifts.
          const wRel = 25 + Math.random() * 20
          const left = Math.random() * (100 - wRel)
          newBonus = { kind, mode: 'embedded', band: { left, width: wRel }, move: null }
        } else {
          // Separate — its own spot on the track, clear of the real
          // target at spawn (with a small margin; up to 15 tries).
          const bw = Math.max(4, z.width * 0.6)
          let left = Math.random() * (100 - bw)
          for (let attempt = 0; attempt < 15; attempt++) {
            const candidate = Math.random() * (100 - bw)
            const overlaps = candidate < z.left + z.width + 3 && candidate + bw > z.left - 3
            if (!overlaps) { left = candidate; break }
          }
          let move: ZoneMove = null
          if (modeRoll >= BONUS_SEPARATE_STATIC_MAX) {
            const moveMs = ZONE_MOVE_MIN_MS + Math.random() * (ZONE_MOVE_BASE_MS - ZONE_MOVE_MIN_MS)
            let b = Math.random() * (100 - bw)
            if (Math.abs(b - left) < 25) b = (left + 40 + Math.random() * 20) % (100 - bw)
            move = { a: left, b, durationMs: moveMs, phaseMs: Math.random() * moveMs }
          }
          newBonus = { kind, mode: 'separate', band: { left, width: bw }, move }
        }
      }
    }
    setBonus(newBonus)

    // Skull — a separate danger region, either mode, never overlapping a
    // real zone (with a small margin). Skipped entirely if no non-
    // overlapping spot turns up in a reasonable number of tries.
    let newSkull: Band | null = null
    if (t > SKULL_START_T && Math.random() < SKULL_CHANCE) {
      const sw = 6 + Math.random() * 4
      for (let attempt = 0; attempt < 15; attempt++) {
        const sl = Math.random() * (100 - sw)
        const overlaps = newZones.some(z => sl < z.left + z.width + 3 && sl + sw > z.left - 3)
        if (!overlaps) { newSkull = { left: sl, width: sw }; break }
      }
    }
    setSkull(newSkull)
    setSkullHit(false)

    const durationJitter = 1 + (Math.random() - 0.5) * JITTER
    const nextDuration = Math.max(MIN_DURATION, (BASE_DURATION - tEff * (BASE_DURATION - MIN_DURATION)) * durationJitter)
    // A random starting point in the marker's back-and-forth cycle (total
    // period = 2x duration) — without this it always begins the round from
    // the same spot, which is exactly what let a player memorise the
    // rhythm instead of having to actually watch it.
    setMarkerPhaseMs(Math.random() * nextDuration * 2 * 1000)

    let move: ZoneMove = null
    if (!useMulti && t > ZONE_MOVE_START_T) {
      const moveT = (t - ZONE_MOVE_START_T) / (1 - ZONE_MOVE_START_T)
      const moveMs = ZONE_MOVE_BASE_MS - moveT * (ZONE_MOVE_BASE_MS - ZONE_MOVE_MIN_MS)
      const z = newZones[0]
      const a = Math.random() * (100 - z.width)
      // The second point is a fresh random spot at least a quarter of the
      // track away from the first, so it's a genuine drift, not a wobble.
      let b = Math.random() * (100 - z.width)
      if (Math.abs(b - a) < 25) b = (a + 40 + Math.random() * 20) % (100 - z.width)
      move = { a, b, durationMs: moveMs, phaseMs: Math.random() * moveMs }
    }
    setZoneMove(move)

    setDuration(nextDuration)
    setRoundId(id => id + 1)
    setResult(null)
    setLastHit(null)
    setPhase('aiming')
  }

  function startGame() {
    setScore(0)
    setLives(STARTING_LIVES)
    setJustBeatBest(false)
    setShowViolin(false)
    setMilestone(null)
    setTestModeUsed(false)
    newRound(0, STARTING_LIVES)
  }

  // Admin-only. Jumps straight into a round at the given difficulty,
  // starting a game first if one isn't already in progress. Marks the
  // run as test-mode so it can never overwrite a real best score.
  function jumpToScore(target: number) {
    const clamped = Math.max(0, Math.min(MAX_SCORE - 1, target))
    setTestModeUsed(true)
    setJustBeatBest(false)
    setShowViolin(false)
    setMilestone(null)
    setScore(clamped)
    const currentLives = phase === 'ready' || lives <= 0 ? STARTING_LIVES : lives
    setLives(currentLives)
    newRound(clamped, currentLives)
  }

  function shoot() {
    if (phase !== 'aiming' || !trackRef.current || !markerRef.current) return
    const trackRect = trackRef.current.getBoundingClientRect()
    const markerRect = markerRef.current.getBoundingClientRect()
    const markerCenterPct = ((markerRect.left + markerRect.width / 2 - trackRect.left) / trackRect.width) * 100
    setShotX(markerCenterPct)
    setShakeKey(k => k + 1)

    // Skull overrides everything — instant game over regardless of lives.
    if (skull && markerCenterPct >= skull.left && markerCenterPct <= skull.left + skull.width) {
      setResult('miss')
      setSkullHit(true)
      setLives(0)
      setPhase('gameover')
      setTimeout(() => setShowViolin(true), 700)
      if (!testModeUsed && bestScore !== null && score > bestScore) {
        setJustBeatBest(true)
        saveScore(score)
      }
      return
    }

    // Which zone (if any) got hit. Multi-target zones are static, so the
    // stored values are already current; the single/moving zone's real
    // position has to be read live off the DOM since it may be mid-drift.
    // HIT_TOLERANCE only applies here (and to the bonus pickup below) —
    // deliberately not to the skull, so the danger zone stays exactly as
    // punishing as it's always been rather than getting easier to trigger.
    let hit: Band | null = null
    if (multiTarget) {
      hit = zones.find(z => markerCenterPct >= z.left - HIT_TOLERANCE && markerCenterPct <= z.left + z.width + HIT_TOLERANCE) ?? null
    } else if (zoneRef.current) {
      const zoneRect = zoneRef.current.getBoundingClientRect()
      const zLeft = ((zoneRect.left - trackRect.left) / trackRect.width) * 100
      const zWidth = (zoneRect.width / trackRect.width) * 100
      if (markerCenterPct >= zLeft - HIT_TOLERANCE && markerCenterPct <= zLeft + zWidth + HIT_TOLERANCE) hit = { left: zLeft, width: zWidth }
    }

    // The bonus pickup — read its live position too, since it may be
    // nested inside a moving zone or drifting entirely on its own, so
    // it's always judged on where it actually is, not where it started.
    let bonusHit = false
    if (bonus && bonusRef.current) {
      const bRect = bonusRef.current.getBoundingClientRect()
      const bLeft = ((bRect.left - trackRect.left) / trackRect.width) * 100
      const bWidth = (bRect.width / trackRect.width) * 100
      bonusHit = markerCenterPct >= bLeft - HIT_TOLERANCE && markerCenterPct <= bLeft + bWidth + HIT_TOLERANCE
    }

    if (hit || bonusHit) {
      let precision = 0
      let points = 0
      if (hit) {
        const zoneCenter = hit.left + hit.width / 2
        const maxDist = hit.width / 2
        const distFromCenter = Math.abs(markerCenterPct - zoneCenter)
        precision = maxDist > 0 ? Math.max(0, 1 - distFromCenter / maxDist) : 1
        points = Math.round(BASE_HIT_PTS + precision * BONUS_HIT_PTS)
      }

      let bonusKind: 'heart' | 'gold' | null = null
      if (bonusHit && bonus) {
        bonusKind = bonus.kind
        if (bonus.kind === 'heart') {
          setLives(l => Math.min(MAX_LIVES, l + 1))
        } else if (hit) {
          points *= 2
        } else {
          // Gold grabbed on its own, with no main-target hit to double —
          // a flat grab instead.
          points = BONUS_HIT_PTS
        }
      }

      const prevScore = score
      const nextScore = Math.min(MAX_SCORE, score + points)
      setScore(nextScore)
      const label =
        bonusKind === 'heart' ? (points > 0 ? `+${points} +1❤️` : '+1 LIFE ❤️')
        : bonusKind === 'gold' ? (hit ? `+${points} 2X!` : `+${points} ⭐`)
        : `+${points}`
      setLastHit({ points, precision, key: Date.now(), bonus: bonusKind, label })
      // A standalone bonus grab (missed the real target) still saves the
      // shot from counting as a miss, but it didn't go in — keeper pose
      // and caption read the same as any other miss.
      setResult(hit ? 'goal' : 'miss')

      const crossed = MILESTONES.find(m => prevScore < m && nextScore >= m)
      if (crossed) {
        const text = crossed === 25 ? '25 — WARMING UP!' : crossed === 50 ? '50 — HALFWAY THERE!' : '75 — ON FIRE!'
        setMilestone({ text, key: Date.now() })
        setTimeout(() => setMilestone(null), 1100)
      }

      if (nextScore >= MAX_SCORE) {
        setPhase('win')
        if (!testModeUsed && (bestScore === null || nextScore > bestScore)) {
          setJustBeatBest(true)
          saveScore(nextScore)
        }
      } else {
        setPhase('result')
        setTimeout(() => newRound(nextScore, lives), 900)
      }
    } else {
      const nextLives = lives - 1
      setLives(nextLives)
      setResult('miss')
      setLastHit(null)

      if (nextLives <= 0) {
        setPhase('gameover')
        setTimeout(() => setShowViolin(true), 700)
        if (!testModeUsed && bestScore !== null && score > bestScore) {
          setJustBeatBest(true)
          saveScore(score)
        }
      } else {
        setPhase('result')
        setTimeout(() => newRound(score, nextLives), 900)
      }
    }
  }

  async function saveScore(newBest: number) {
    setBestScore(newBest)
    await supabase
      .from('minigame_penalty_scores')
      .upsert({ user_id: userId, best_score: newBest, updated_at: new Date().toISOString() })
    loadScores()
  }

  // Keeper dives toward the shot on a miss (that's the save), and dives
  // the WRONG way on a goal (sells the idea that they guessed wrong rather
  // than just standing there while the ball sails past). Idle/ready pose
  // otherwise, and the violin taunt takes over once the game is actually
  // over. There's only one keeper image (standing) — the "dive" is that
  // same image rotated to fake a lunge, mirrored to face whichever side
  // the shot went. The rotation angle is the same regardless of direction
  // — scaleX(-1) alone handles the left/right symmetry; flipping the
  // rotation's sign along with the mirror would double-flip the pose and
  // put the feet where the glove should be.
  const keeper = showViolin
    ? { pose: 'violin' as const, x: 50, mirror: false, rotate: 0 }
    : result === 'miss'
    ? { pose: 'dive' as const, x: shotX, mirror: shotX >= 50, rotate: -50 }
    : result === 'goal'
    ? { pose: 'dive' as const, x: 100 - shotX, mirror: (100 - shotX) >= 50, rotate: -50 }
    : { pose: 'ready' as const, x: 50, mirror: false, rotate: 0 }

  const chaosVisuals = phase !== 'ready' && difficultyT > CHAOS_VISUAL_START_T
  const livesShown = Math.max(STARTING_LIVES, lives)

  return (
    <div className="pop-art-theme" style={{ color: 'var(--pop-white)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="pop-headline text-xl">Penalty Shootout</p>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold leading-none" style={{ color: score < 0 ? 'var(--pop-red)' : 'var(--pop-green)' }}>{score}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>/99</span></p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            best: {bestScore ?? '—'}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-lg p-2.5 mb-3" style={{ background: 'rgba(125,55,165,0.08)', border: '1px solid rgba(125,55,165,0.3)' }}>
          <p className="font-mono text-[9px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--pop-yellow)' }}>
            Admin test mode — jumps difficulty, never saves to the leaderboard
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {[60, 70, 80, 90, 95].map(s => (
              <button
                key={s}
                onClick={() => jumpToScore(s)}
                className="font-mono text-xs font-bold px-2.5 py-1 rounded"
                style={{ background: 'rgba(125,55,165,0.15)', color: 'var(--pop-yellow)', border: '1px solid rgba(125,55,165,0.4)' }}
              >
                → {s}
              </button>
            ))}
          </div>
          {testModeUsed && (
            <p className="font-mono text-[9px] mt-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              This run won&apos;t save — start a fresh game to play for real.
            </p>
          )}
        </div>
      )}

      {phase !== 'ready' && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1 text-lg leading-none">
            {Array.from({ length: livesShown }).map((_, i) => (
              <span key={i}>{i < lives ? '❤️' : '🖤'}</span>
            ))}
          </div>
          <div className="h-1.5 rounded-full flex-1 ml-3" style={{ background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (score / MAX_SCORE) * 100))}%`, background: 'linear-gradient(90deg, var(--pop-pink), var(--pop-orange), var(--pop-yellow))', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Goal backdrop is real artwork; keeper and ball are too, layered
          on top and positioned/animated in code. Locked to the photo's own
          aspect ratio (rather than a fixed pixel height) so it's never
          cropped — every % position below always lands where it looks
          like it should, on phones and wide screens alike. Past the chaos
          threshold the border cycles colour, just to sell "this has gone
          off the rails" before you've even seen the moving target. */}
      <div
        key={shakeKey}
        className={`relative rounded-xl mb-4 ${result ? 'pop-shoot-shake' : ''} ${chaosVisuals ? 'pop-shoot-chaos-border' : ''}`}
        style={{ aspectRatio: GOAL_ASPECT, overflow: 'hidden', backgroundImage: 'url(/shootout-goal.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <img
          src={keeper.pose === 'violin' ? '/shootout-keeper-violin.png' : '/shootout-keeper-ready.png'}
          alt=""
          style={{
            position: 'absolute',
            // The violin taunt is meant to be an in-your-face reaction, not
            // just another goal-line pose — bigger and further forward
            // (lower/closer to camera) than the ready/dive stance.
            bottom: keeper.pose === 'violin' ? '15%' : '27%',
            left: `${toGoalX(keeper.x)}%`,
            height: keeper.pose === 'violin' ? '55%' : '38%',
            transform: `translateX(-50%) scaleX(${keeper.mirror ? -1 : 1}) rotate(${keeper.rotate}deg)`,
            transition: 'left 0.3s ease, transform 0.3s ease, height 0.3s ease, bottom 0.3s ease',
          }}
        />
        <img
          src="/shootout-ball.png"
          alt=""
          style={{
            position: 'absolute',
            // On a miss the ball is caught in front of the goal line, not
            // inside the net — well below the grass line, same
            // neighbourhood as the resting/idle position, so it never
            // reads as scored.
            bottom: result === 'goal' ? '58%' : result === 'miss' ? '13%' : '15%',
            width: 22, height: 22,
            left: `calc(${toGoalX(result ? shotX : 50)}% - 11px)`,
            transition: 'left 0.4s ease, bottom 0.4s ease',
          }}
          className={result === 'goal' ? 'pop-pop-in' : ''}
        />
        {result && !skullHit && (
          <p
            style={{
              position: 'absolute', top: '4%', left: 0, right: 0, textAlign: 'center',
              fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '0.04em',
              color: result === 'goal' ? 'var(--pop-green)' : 'var(--pop-red)',
              textShadow: `0 0 14px ${result === 'goal' ? 'rgba(204,250,0,0.7)' : 'rgba(250,0,60,0.7)'}`,
            }}
          >
            {result === 'goal' ? 'GOAL!' : 'SAVED!'}
          </p>
        )}
        {skullHit && (
          <p
            style={{
              position: 'absolute', top: '4%', left: 0, right: 0, textAlign: 'center',
              fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '0.03em',
              color: 'var(--pop-red)', textShadow: '0 0 16px rgba(250,0,60,0.85)',
            }}
          >
            💀 INSTANT DEATH!
          </p>
        )}
        {lastHit && (
          <div
            key={lastHit.key}
            className="pop-shoot-float"
            style={{
              position: 'absolute', left: `calc(${toGoalX(shotX)}% - 34px)`, bottom: '55%',
              width: 68, textAlign: 'center', pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 26, lineHeight: 1 }}>{lastHit.bonus === 'heart' ? '❤️' : lastHit.bonus === 'gold' ? '⭐' : reactionEmoji(lastHit.precision)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--pop-yellow)', textShadow: '0 0 8px rgba(0,0,0,0.8)' }}>
              {lastHit.label}
            </div>
          </div>
        )}
        {milestone && (
          <p
            key={milestone.key}
            className="pop-shoot-milestone"
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 30, letterSpacing: '0.03em',
              color: 'var(--pop-yellow)', textShadow: '0 0 20px rgba(125,55,165,0.8), 0 0 6px rgba(0,0,0,0.9)',
              background: 'rgba(0,0,0,0.25)',
            }}
          >
            {milestone.text}
          </p>
        )}
      </div>

      {/* Aim track — the pink marker always sweeps; past a difficulty
          threshold the orange target zone(s) drift on their own
          independent cycle too, so the late game is genuinely two moving
          things to track, not one. A bonus pickup sometimes appears —
          embedded inside the real target (nested in its DOM so it rides
          along if the target drifts), or off on its own, sometimes with
          its own independent drift. A skull patch sometimes sits nearby,
          never overlapping a real target. */}
      <div ref={trackRef} className="relative rounded-full mb-4" style={{ height: 14, background: 'rgba(255,255,255,0.08)' }}>
        {multiTarget ? (
          zones.map((z, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 rounded-full"
              style={{ left: `${z.left}%`, width: `${z.width}%`, background: 'rgba(250,97,0,0.4)', border: '1px solid var(--pop-orange)' }}
            />
          ))
        ) : (
          <div
            ref={zoneRef}
            className="absolute top-0 bottom-0 rounded-full"
            style={{ left: `${zones[0].left}%`, width: `${zones[0].width}%`, background: 'rgba(250,97,0,0.4)', border: '1px solid var(--pop-orange)' }}
          >
            {bonus?.mode === 'embedded' && (
              <div
                ref={bonusRef}
                className="absolute rounded-full pop-shoot-bonus-pulse"
                style={{ left: `${bonus.band.left}%`, width: `${bonus.band.width}%`, top: -7, bottom: -7, background: bonus.kind === 'heart' ? 'rgba(250,0,60,0.5)' : 'rgba(125,55,165,0.5)', border: `1px solid ${bonus.kind === 'heart' ? 'var(--pop-red)' : 'var(--pop-yellow)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}
              >
                {bonus.kind === 'heart' ? '❤️' : '⭐'}
              </div>
            )}
          </div>
        )}
        {bonus?.mode === 'separate' && (
          <div
            ref={bonusRef}
            className="absolute rounded-full pop-shoot-bonus-pulse"
            style={{ left: `${bonus.band.left}%`, width: `${bonus.band.width}%`, top: -7, bottom: -7, background: bonus.kind === 'heart' ? 'rgba(250,0,60,0.5)' : 'rgba(125,55,165,0.5)', border: `1px solid ${bonus.kind === 'heart' ? 'var(--pop-red)' : 'var(--pop-yellow)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}
          >
            {bonus.kind === 'heart' ? '❤️' : '⭐'}
          </div>
        )}
        {skull && (
          <div
            className="absolute rounded-full pop-shoot-skull-pulse"
            style={{ left: `${skull.left}%`, width: `${skull.width}%`, top: -3, bottom: -3, background: 'rgba(20,20,20,0.85)', border: '1px solid var(--pop-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}
          >
            💀
          </div>
        )}
        <div
          key={roundId}
          ref={markerRef}
          className="pop-shoot-marker absolute top-0 bottom-0 rounded-full"
          style={{
            width: `${MARKER_WIDTH}%`,
            background: 'var(--pop-pink)',
            boxShadow: '0 0 12px rgba(160,0,250,0.8)',
            animationDuration: `${duration}s`,
            animationDelay: `-${markerPhaseMs}ms`,
            animationPlayState: phase === 'aiming' ? 'running' : 'paused',
          }}
        />
      </div>

      {phase === 'ready' && (
        <button onClick={startGame} className="pop-button pop-button--green w-full py-3 text-lg">
          Start
        </button>
      )}
      {phase === 'aiming' && (
        // onPointerDown, not onClick — the marker can be sweeping the full
        // track in as little as 0.28s, so the ~50-300ms a browser can take
        // to synthesize a click event after a tap (waiting to rule out a
        // double-tap) was enough lag on its own to make a shot land
        // somewhere the marker had already moved on from. Firing on the
        // very first contact event removes that lag; touchAction stops
        // the browser treating it as a possible double-tap-to-zoom.
        <button
          onPointerDown={shoot}
          className="pop-button w-full py-3 text-lg"
          style={{ background: 'var(--pop-pink)', touchAction: 'manipulation' }}
        >
          Shoot
        </button>
      )}
      {phase === 'result' && (
        <button disabled className="pop-button w-full py-3 text-lg" style={{ opacity: 0.6 }}>
          Next shot…
        </button>
      )}
      {phase === 'win' && (
        <div>
          <p className="pop-headline text-center text-2xl mb-1" style={{ color: 'var(--pop-yellow)' }}>
            🏆 LEGENDARY! 99/99!
          </p>
          <p className="text-center font-mono text-sm mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Perfect run — not many people ever see this screen.
          </p>
          <button onClick={startGame} className="pop-button pop-button--green w-full py-3 text-lg">
            Play Again
          </button>
        </div>
      )}
      {phase === 'gameover' && (
        <div>
          <p className="pop-headline text-center text-lg mb-1">
            {skullHit ? '💀 Instant Death!' : justBeatBest ? 'New Best!' : 'Game Over'}
          </p>
          <p className="text-center font-mono text-sm mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
            You scored {score}
          </p>
          <button onClick={startGame} className="pop-button pop-button--green w-full py-3 text-lg">
            Play Again
          </button>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="pop-panel mt-5 p-3">
          <p className="pop-headline text-xs mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>Top Scores</p>
          <div className="space-y-1">
            {leaderboard.map((row, i) => (
              <div key={i} className="flex items-center justify-between text-xs font-mono">
                <span style={{ color: 'rgba(255,255,255,0.75)' }}>{i + 1}. {row.name}</span>
                <span style={{ color: 'var(--pop-green)' }}>{row.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

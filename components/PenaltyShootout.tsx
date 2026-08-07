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
// - score ticks down 1/point/second while you're deciding — dawdling
//   costs you, and it can push the score negative
// - past the harder stretch, rounds occasionally swap the one brutal zone
//   for TWO wider ones instead (hit either) — a deliberate breather, not
//   guaranteed every round
// - a hidden bonus sub-region sometimes sits inside the real target: a
//   heart grants a life back (capped at 5), gold doubles that shot's
//   points — mutually exclusive per round
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

// The zone stays put until you're this far toward 99 — the first chunk of
// the game is deliberately still "just" a fast-narrowing static target,
// so the opening points stay easy, matching "1 should be super easy".
const ZONE_MOVE_START_T = 0.1
const ZONE_MOVE_BASE_MS = 2200
const ZONE_MOVE_MIN_MS = 420

// Lose a point a second while you're aiming — pure urgency, encourages
// shooting on instinct instead of stalling for the "perfect" moment.
const TICK_MS = 1000

// Two friendlier zones instead of one brutal one, occasionally, once
// things are properly fast — a deliberate breather stage, not a reward
// for skill, so it's random whether any given late-game round gets it.
const MULTI_TARGET_START_T = 0.55
const MULTI_TARGET_CHANCE = 0.4

// Hidden bonus sub-region inside a (single-target) round's real zone.
// Mutually exclusive per round — only one of the two can show up.
const HEART_CHANCE = 0.18
const GOLD_CHANCE = 0.12

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

export default function PenaltyShootout({ userId }: { userId: string }) {
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(STARTING_LIVES)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<'goal' | 'miss' | null>(null)
  const [zones, setZones] = useState<Band[]>([{ left: 40, width: BASE_WIDTH }])
  const [multiTarget, setMultiTarget] = useState(false)
  const [zoneMove, setZoneMove] = useState<ZoneMove>(null)
  const [heart, setHeart] = useState<Band | null>(null)
  const [gold, setGold] = useState<Band | null>(null)
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
  const [lastHit, setLastHit] = useState<{ points: number; precision: number; key: number; bonus: 'heart' | 'gold' | null } | null>(null)
  const [milestone, setMilestone] = useState<{ text: string; key: number } | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  // There's no dedicated diving-keeper artwork — the "dive" is the same
  // standing keeper image, rotated in CSS to fake a lunge. Only on the
  // FINAL miss (lives run out) does he switch to the violin taunt — with
  // up to 5 lives now, doing that on every single miss would get old fast.
  const [showViolin, setShowViolin] = useState(false)

  const trackRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const zoneRef = useRef<HTMLDivElement>(null)
  const zoneAnimRef = useRef<Animation | null>(null)
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

  useEffect(() => {
    if (!zoneAnimRef.current) return
    if (phase === 'aiming') zoneAnimRef.current.play()
    else zoneAnimRef.current.pause()
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

    const useMulti = t > MULTI_TARGET_START_T && Math.random() < MULTI_TARGET_CHANCE
    let newZones: Band[]
    if (useMulti) {
      // Wider than the single-zone equivalent at this difficulty — the
      // extra target IS the relief, not just more surface area.
      const mtWidth = Math.min(BASE_WIDTH * 0.55, singleWidth * 1.9)
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

    // Heart / gold — single-target rounds only, so hit-detection against
    // them never has to reason about which of several zones they're in.
    let newHeart: Band | null = null
    let newGold: Band | null = null
    if (!useMulti) {
      const z = newZones[0]
      const roll = Math.random()
      if (currentLives < MAX_LIVES && roll < HEART_CHANCE) {
        const hw = Math.max(2, z.width * 0.35)
        newHeart = { left: z.left + Math.random() * Math.max(0, z.width - hw), width: hw }
      } else if (roll < HEART_CHANCE + GOLD_CHANCE) {
        const gw = Math.max(2, z.width * 0.35)
        newGold = { left: z.left + Math.random() * Math.max(0, z.width - gw), width: gw }
      }
    }
    setHeart(newHeart)
    setGold(newGold)

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
    newRound(0, STARTING_LIVES)
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
      if (bestScore !== null && score > bestScore) {
        setJustBeatBest(true)
        saveScore(score)
      }
      return
    }

    // Which zone (if any) got hit. Multi-target zones are static, so the
    // stored values are already current; the single/moving zone's real
    // position has to be read live off the DOM since it may be mid-drift.
    let hit: Band | null = null
    if (multiTarget) {
      hit = zones.find(z => markerCenterPct >= z.left && markerCenterPct <= z.left + z.width) ?? null
    } else if (zoneRef.current) {
      const zoneRect = zoneRef.current.getBoundingClientRect()
      const zLeft = ((zoneRect.left - trackRect.left) / trackRect.width) * 100
      const zWidth = (zoneRect.width / trackRect.width) * 100
      if (markerCenterPct >= zLeft && markerCenterPct <= zLeft + zWidth) hit = { left: zLeft, width: zWidth }
    }

    if (hit) {
      const zoneCenter = hit.left + hit.width / 2
      const maxDist = hit.width / 2
      const distFromCenter = Math.abs(markerCenterPct - zoneCenter)
      const precision = maxDist > 0 ? Math.max(0, 1 - distFromCenter / maxDist) : 1
      let points = Math.round(BASE_HIT_PTS + precision * BONUS_HIT_PTS)

      let bonus: 'heart' | 'gold' | null = null
      if (heart && markerCenterPct >= heart.left && markerCenterPct <= heart.left + heart.width) {
        bonus = 'heart'
        setLives(l => Math.min(MAX_LIVES, l + 1))
      } else if (gold && markerCenterPct >= gold.left && markerCenterPct <= gold.left + gold.width) {
        bonus = 'gold'
        points *= 2
      }

      const prevScore = score
      const nextScore = Math.min(MAX_SCORE, score + points)
      setScore(nextScore)
      setLastHit({ points, precision, key: Date.now(), bonus })
      setResult('goal')

      const crossed = MILESTONES.find(m => prevScore < m && nextScore >= m)
      if (crossed) {
        const text = crossed === 25 ? '25 — WARMING UP!' : crossed === 50 ? '50 — HALFWAY THERE!' : '75 — ON FIRE!'
        setMilestone({ text, key: Date.now() })
        setTimeout(() => setMilestone(null), 1100)
      }

      if (nextScore >= MAX_SCORE) {
        setPhase('win')
        if (bestScore === null || nextScore > bestScore) {
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
        if (bestScore !== null && score > bestScore) {
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
              textShadow: `0 0 14px ${result === 'goal' ? 'rgba(0,230,118,0.7)' : 'rgba(232,38,42,0.7)'}`,
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
              color: 'var(--pop-red)', textShadow: '0 0 16px rgba(232,38,42,0.85)',
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
            <div style={{ fontSize: 26, lineHeight: 1 }}>{lastHit.bonus === 'heart' ? '❤️' : reactionEmoji(lastHit.precision)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: lastHit.bonus === 'gold' ? 'var(--pop-yellow)' : 'var(--pop-yellow)', textShadow: '0 0 8px rgba(0,0,0,0.8)' }}>
              +{lastHit.points}{lastHit.bonus === 'gold' ? ' 2X!' : ''}
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
              color: 'var(--pop-yellow)', textShadow: '0 0 20px rgba(255,234,0,0.8), 0 0 6px rgba(0,0,0,0.9)',
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
          things to track, not one. A hidden heart/gold band sometimes
          hides inside a single target; a skull patch sometimes sits
          nearby, never overlapping a real target. */}
      <div ref={trackRef} className="relative rounded-full mb-4" style={{ height: 14, background: 'rgba(255,255,255,0.08)' }}>
        {multiTarget ? (
          zones.map((z, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 rounded-full"
              style={{ left: `${z.left}%`, width: `${z.width}%`, background: 'rgba(255,61,0,0.4)', border: '1px solid var(--pop-orange)' }}
            />
          ))
        ) : (
          <div
            ref={zoneRef}
            className="absolute top-0 bottom-0 rounded-full"
            style={{ left: `${zones[0].left}%`, width: `${zones[0].width}%`, background: 'rgba(255,61,0,0.4)', border: '1px solid var(--pop-orange)' }}
          />
        )}
        {heart && (
          <div
            className="absolute rounded-full pop-shoot-bonus-pulse"
            style={{ left: `${heart.left}%`, width: `${heart.width}%`, top: -7, bottom: -7, background: 'rgba(232,38,42,0.5)', border: '1px solid var(--pop-red)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}
          >
            ❤️
          </div>
        )}
        {gold && (
          <div
            className="absolute rounded-full pop-shoot-bonus-pulse"
            style={{ left: `${gold.left}%`, width: `${gold.width}%`, top: -7, bottom: -7, background: 'rgba(255,234,0,0.5)', border: '1px solid var(--pop-yellow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}
          >
            ⭐
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
            boxShadow: '0 0 12px rgba(213,0,109,0.8)',
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
        <button onClick={shoot} className="pop-button w-full py-3 text-lg" style={{ background: 'var(--pop-pink)' }}>
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

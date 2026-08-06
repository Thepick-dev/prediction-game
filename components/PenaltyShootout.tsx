'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '../app/lib/supabase'

// Not connected to the prediction game in any way — purely a bit of fun,
// separate scoring, separate table.
//
// Scoring model (v3): points, not a streak count. Every hit scores 2-7
// points depending on how close to the CENTRE of the target zone you hit.
// 3 lives, not sudden death on the first miss.
//
// v2 (pure width/speed tuning) turned out to be far too easy in real play
// — a first-ever attempt scored 96/99 — because the marker always swept
// from the exact same starting point in a perfectly predictable straight
// line, just scaled by duration. Once you know the rhythm, timing one
// click against a metronome is easy for a human regardless of how fast it
// gets. Two structural fixes on top of a harsher floor: the marker now
// starts each round at a random point in its sweep (so there's no fixed
// rhythm to memorise), and past a certain score the TARGET ZONE ITSELF
// starts drifting back and forth too, on its own independent, ever-
// quickening cycle — so late-game is genuinely two things to track at
// once, not one thing done fast.
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

export default function PenaltyShootout({ userId }: { userId: string }) {
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(STARTING_LIVES)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<'goal' | 'miss' | null>(null)
  const [zone, setZone] = useState({ left: 40, width: BASE_WIDTH })
  const [zoneMove, setZoneMove] = useState<ZoneMove>(null)
  const [duration, setDuration] = useState(BASE_DURATION)
  const [markerPhaseMs, setMarkerPhaseMs] = useState(0)
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
  const [lastHit, setLastHit] = useState<{ points: number; precision: number; key: number } | null>(null)
  const [milestone, setMilestone] = useState<{ text: string; key: number } | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  // There's no dedicated diving-keeper artwork — the "dive" is the same
  // standing keeper image, rotated in CSS to fake a lunge. Only on the
  // FINAL miss (lives run out) does he switch to the violin taunt — with
  // 3 lives now, doing that on every single miss would get old fast.
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
  // stylesheet. Paused/resumed by the phase effect below, cancelled and
  // replaced whenever a new round starts.
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

  function newRound(currentScore: number) {
    const t = Math.min(1, currentScore / MAX_SCORE)
    const tEff = Math.pow(t, CURVE_EXP)

    const widthJitter = 1 + (Math.random() - 0.5) * JITTER
    const width = Math.max(MIN_WIDTH, (BASE_WIDTH - tEff * (BASE_WIDTH - MIN_WIDTH)) * widthJitter)
    const left = Math.random() * (100 - width)

    const durationJitter = 1 + (Math.random() - 0.5) * JITTER
    const nextDuration = Math.max(MIN_DURATION, (BASE_DURATION - tEff * (BASE_DURATION - MIN_DURATION)) * durationJitter)
    // A random starting point in the marker's back-and-forth cycle (total
    // period = 2x duration) — without this it always begins the round from
    // the same spot, which is exactly what let a player memorise the
    // rhythm instead of having to actually watch it.
    setMarkerPhaseMs(Math.random() * nextDuration * 2 * 1000)

    let move: ZoneMove = null
    if (t > ZONE_MOVE_START_T) {
      const moveT = (t - ZONE_MOVE_START_T) / (1 - ZONE_MOVE_START_T)
      const moveMs = ZONE_MOVE_BASE_MS - moveT * (ZONE_MOVE_BASE_MS - ZONE_MOVE_MIN_MS)
      const a = Math.random() * (100 - width)
      // The second point is a fresh random spot at least a quarter of the
      // track away from the first, so it's a genuine drift, not a wobble.
      let b = Math.random() * (100 - width)
      if (Math.abs(b - a) < 25) b = (a + 40 + Math.random() * 20) % (100 - width)
      move = { a, b, durationMs: moveMs, phaseMs: Math.random() * moveMs }
    }
    setZoneMove(move)

    setZone({ left, width })
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
    newRound(0)
  }

  function shoot() {
    if (phase !== 'aiming' || !trackRef.current || !markerRef.current || !zoneRef.current) return
    const trackRect = trackRef.current.getBoundingClientRect()
    const markerRect = markerRef.current.getBoundingClientRect()
    // Read the zone's LIVE position (it may be mid-drift) rather than the
    // left/width captured in state at the start of the round.
    const zoneRect = zoneRef.current.getBoundingClientRect()
    const markerCenterPct = ((markerRect.left + markerRect.width / 2 - trackRect.left) / trackRect.width) * 100
    const zoneLeftPct = ((zoneRect.left - trackRect.left) / trackRect.width) * 100
    const zoneWidthPct = (zoneRect.width / trackRect.width) * 100
    setShotX(markerCenterPct)
    const hit = markerCenterPct >= zoneLeftPct && markerCenterPct <= zoneLeftPct + zoneWidthPct
    setShakeKey(k => k + 1)

    if (hit) {
      const zoneCenter = zoneLeftPct + zoneWidthPct / 2
      const maxDist = zoneWidthPct / 2
      const distFromCenter = Math.abs(markerCenterPct - zoneCenter)
      const precision = maxDist > 0 ? Math.max(0, 1 - distFromCenter / maxDist) : 1
      const points = Math.round(BASE_HIT_PTS + precision * BONUS_HIT_PTS)
      const prevScore = score
      const nextScore = Math.min(MAX_SCORE, score + points)
      setScore(nextScore)
      setLastHit({ points, precision, key: Date.now() })
      setResult('goal')

      const crossed = MILESTONES.find(m => prevScore < m && nextScore >= m)
      if (crossed) {
        const text = crossed === 25 ? '25 — WARMING UP!' : crossed === 50 ? '50 — HALFWAY THERE!' : '75 — ON FIRE!'
        setMilestone({ text, key: Date.now() })
        // Never cleared itself before, so once shown it just sat there
        // displaying the same banner over every later shot regardless of
        // score — matches the animation's own ~1.1s duration.
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
        setTimeout(() => newRound(nextScore), 900)
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
        setTimeout(() => newRound(score), 900)
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

  return (
    <div className="pop-art-theme" style={{ color: 'var(--pop-white)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="pop-headline text-xl">Penalty Shootout</p>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold leading-none" style={{ color: 'var(--pop-green)' }}>{score}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>/99</span></p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            best: {bestScore ?? '—'}
          </p>
        </div>
      </div>

      {phase !== 'ready' && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1 text-lg leading-none">
            {Array.from({ length: STARTING_LIVES }).map((_, i) => (
              <span key={i}>{i < lives ? '❤️' : '🖤'}</span>
            ))}
          </div>
          <div className="h-1.5 rounded-full flex-1 ml-3" style={{ background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div className="h-full rounded-full" style={{ width: `${(score / MAX_SCORE) * 100}%`, background: 'linear-gradient(90deg, var(--pop-pink), var(--pop-orange), var(--pop-yellow))', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      {/* Goal backdrop is real artwork; keeper and ball are too, layered
          on top and positioned/animated in code. Locked to the photo's own
          aspect ratio (rather than a fixed pixel height) so it's never
          cropped — every % position below always lands where it looks
          like it should, on phones and wide screens alike. */}
      <div
        key={shakeKey}
        className={`relative rounded-xl mb-4 ${result ? 'pop-shoot-shake' : ''}`}
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
        {result && (
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
        {lastHit && (
          <div
            key={lastHit.key}
            className="pop-shoot-float"
            style={{
              position: 'absolute', left: `calc(${toGoalX(shotX)}% - 30px)`, bottom: '55%',
              width: 60, textAlign: 'center', pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 26, lineHeight: 1 }}>{reactionEmoji(lastHit.precision)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--pop-yellow)', textShadow: '0 0 8px rgba(0,0,0,0.8)' }}>+{lastHit.points}</div>
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
          threshold the orange target zone drifts on its own independent
          cycle too (driven by the Web Animation set up above), so the
          late game is genuinely two moving things to track, not one. */}
      <div ref={trackRef} className="relative rounded-full mb-4" style={{ height: 14, background: 'rgba(255,255,255,0.08)' }}>
        <div
          ref={zoneRef}
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `${zone.left}%`,
            width: `${zone.width}%`,
            background: 'rgba(255,61,0,0.4)',
            border: '1px solid var(--pop-orange)',
          }}
        />
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
            {justBeatBest ? 'New Best!' : 'Game Over'}
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

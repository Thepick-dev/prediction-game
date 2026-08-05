'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '../app/lib/supabase'

// Not connected to the prediction game in any way — purely a bit of fun,
// separate scoring, separate table. Difficulty scales with the streak: the
// aim marker sweeps faster and the scoring zone shrinks each goal, so it
// gets genuinely hard to keep a long run alive rather than being winnable
// by mashing the button. A per-round random jitter is layered on top of
// that trend so two rounds at the same score never play identically —
// this is the arcade "replay value" bit, not just a difficulty curve.
const BASE_DURATION = 1.3
const MIN_DURATION = 0.45
const DURATION_STEP = 0.14
const BASE_ZONE_WIDTH = 30
const MIN_ZONE_WIDTH = 10
const ZONE_STEP = 3.2
// +/- this fraction, applied fresh every round.
const JITTER = 0.3
// Kept in sync with globals.css's .pop-shoot-sweep keyframe by hand (it
// animates left: 0% -> 95%, i.e. 100 - this value) — the sweep path is a
// static CSS animation for smooth GPU-composited motion, so it can't read
// this constant directly.
const MARKER_WIDTH = 5

// The goal photo (shootout-goal.png) has real sky/grass margin either side
// of the actual goal frame rather than the frame filling the whole image —
// measured directly off the artwork. Every horizontal position drawn on
// top of that photo (ball, keeper) is mapped through this so nothing ever
// visually lands outside the goal mouth, in the grass or sky. GOAL_LINE_PCT
// is how far down the image the net meets the ground.
const GOAL_ASPECT = '1375 / 768'
const GOAL_LEFT_PCT = 13.5
const GOAL_RIGHT_PCT = 86.5
const GOAL_LINE_PCT = 70
function toGoalX(pct: number) {
  return GOAL_LEFT_PCT + (pct / 100) * (GOAL_RIGHT_PCT - GOAL_LEFT_PCT)
}

type Phase = 'ready' | 'aiming' | 'result' | 'gameover'

export default function PenaltyShootout({ userId }: { userId: string }) {
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<'goal' | 'miss' | null>(null)
  const [zone, setZone] = useState({ left: 40, width: BASE_ZONE_WIDTH })
  const [duration, setDuration] = useState(BASE_DURATION)
  // Where the last shot actually landed (0-100, aim-track space) — used to
  // place the ball/keeper visually, instead of the zone's centre, so what
  // you see always matches what you clicked.
  const [shotX, setShotX] = useState(50)
  // Bumped every round and used as the marker's React key, so its CSS
  // sweep animation always restarts cleanly at 0% for the new round's
  // duration. Without this, changing animation-duration on a running
  // animation makes the browser re-map elapsed time onto the new duration
  // instead of restarting it, so the marker jumps to an arbitrary point
  // mid-sweep the instant a new round begins.
  const [roundId, setRoundId] = useState(0)
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([])
  const [justBeatBest, setJustBeatBest] = useState(false)
  // There's no dedicated diving-keeper artwork — the "dive" is the same
  // standing keeper image, rotated in CSS to fake a lunge. After a miss,
  // he holds that reaction for a beat, then switches to the violin taunt
  // (mocking the save) until the next round starts.
  const [showViolin, setShowViolin] = useState(false)

  const trackRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => { loadScores() }, [])

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

  function newRound(nextScore: number) {
    const widthJitter = 1 + (Math.random() - 0.5) * JITTER
    const width = Math.max(MIN_ZONE_WIDTH, (BASE_ZONE_WIDTH - nextScore * ZONE_STEP) * widthJitter)
    const left = Math.random() * (100 - width)
    const durationJitter = 1 + (Math.random() - 0.5) * JITTER
    const nextDuration = Math.max(MIN_DURATION, (BASE_DURATION - nextScore * DURATION_STEP) * durationJitter)
    setZone({ left, width })
    setDuration(nextDuration)
    setRoundId(id => id + 1)
    setResult(null)
    setShowViolin(false)
    setPhase('aiming')
  }

  function startGame() {
    setScore(0)
    setJustBeatBest(false)
    newRound(0)
  }

  function shoot() {
    if (phase !== 'aiming' || !trackRef.current || !markerRef.current) return
    const trackRect = trackRef.current.getBoundingClientRect()
    const markerRect = markerRef.current.getBoundingClientRect()
    const markerCenterPct = ((markerRect.left + markerRect.width / 2 - trackRect.left) / trackRect.width) * 100
    setShotX(markerCenterPct)
    const hit = markerCenterPct >= zone.left && markerCenterPct <= zone.left + zone.width

    if (hit) {
      const nextScore = score + 1
      setScore(nextScore)
      setResult('goal')
      setPhase('result')
      setTimeout(() => newRound(nextScore), 850)
    } else {
      setResult('miss')
      setPhase('gameover')
      setTimeout(() => setShowViolin(true), 700)
      if (bestScore !== null && score > bestScore) {
        setJustBeatBest(true)
        saveScore(score)
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
  // otherwise, and the violin taunt takes over a beat after a miss. There's
  // only one keeper image (standing) — the "dive" is that same image
  // rotated to fake a lunge, mirrored to face whichever side the shot went.
  const keeper = showViolin
    ? { pose: 'violin' as const, x: 50, mirror: false, rotate: 0 }
    : result === 'miss'
    ? { pose: 'dive' as const, x: shotX, mirror: shotX >= 50, rotate: shotX >= 50 ? -68 : 68 }
    : result === 'goal'
    ? { pose: 'dive' as const, x: 100 - shotX, mirror: (100 - shotX) >= 50, rotate: (100 - shotX) >= 50 ? -68 : 68 }
    : { pose: 'ready' as const, x: 50, mirror: false, rotate: 0 }

  return (
    <div className="pop-art-theme" style={{ color: 'var(--pop-white)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="pop-headline text-xl">Penalty Shootout</p>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold leading-none" style={{ color: 'var(--pop-green)' }}>{score}</p>
          <p className="font-mono text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            best: {bestScore ?? '—'}
          </p>
        </div>
      </div>

      {/* Goal backdrop is real artwork; keeper and ball are too, layered
          on top and positioned/animated in code. Locked to the photo's own
          aspect ratio (rather than a fixed pixel height) so it's never
          cropped — every % position below always lands where it looks
          like it should, on phones and wide screens alike. */}
      <div
        className="relative rounded-xl mb-4"
        style={{ aspectRatio: GOAL_ASPECT, overflow: 'hidden', backgroundImage: 'url(/shootout-goal.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <img
          src={keeper.pose === 'violin' ? '/shootout-keeper-violin.png' : '/shootout-keeper-ready.png'}
          alt=""
          style={{
            position: 'absolute',
            bottom: '27%',
            left: `${toGoalX(keeper.x)}%`,
            height: '38%',
            transform: `translateX(-50%) scaleX(${keeper.mirror ? -1 : 1}) rotate(${keeper.rotate}deg)`,
            transition: 'left 0.3s ease, transform 0.3s ease',
          }}
        />
        <img
          src="/shootout-ball.png"
          alt=""
          style={{
            position: 'absolute',
            bottom: result === 'goal' ? '58%' : result === 'miss' ? '27%' : '15%',
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
      </div>

      {/* Aim track */}
      <div ref={trackRef} className="relative rounded-full mb-4" style={{ height: 14, background: 'rgba(255,255,255,0.08)' }}>
        <div
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

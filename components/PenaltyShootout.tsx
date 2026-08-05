'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '../app/lib/supabase'

// Not connected to the prediction game in any way — purely a bit of fun,
// separate scoring, separate table. Difficulty scales with the streak: the
// aim marker sweeps faster and the scoring zone shrinks each goal, so it
// gets genuinely hard to keep a long run alive rather than being winnable
// by mashing the button.
const BASE_DURATION = 1.3
const MIN_DURATION = 0.45
const DURATION_STEP = 0.14
const BASE_ZONE_WIDTH = 30
const MIN_ZONE_WIDTH = 10
const ZONE_STEP = 3.2
// Kept in sync with globals.css's .pop-shoot-sweep keyframe by hand (it
// animates left: 0% -> 95%, i.e. 100 - this value) — the sweep path is a
// static CSS animation for smooth GPU-composited motion, so it can't read
// this constant directly.
const MARKER_WIDTH = 5

type Phase = 'ready' | 'aiming' | 'result' | 'gameover'

export default function PenaltyShootout({ userId }: { userId: string }) {
  const [score, setScore] = useState(0)
  const [bestScore, setBestScore] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [result, setResult] = useState<'goal' | 'miss' | null>(null)
  const [zone, setZone] = useState({ left: 40, width: BASE_ZONE_WIDTH })
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([])
  const [justBeatBest, setJustBeatBest] = useState(false)

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
    const width = Math.max(MIN_ZONE_WIDTH, BASE_ZONE_WIDTH - nextScore * ZONE_STEP)
    const left = Math.random() * (100 - width)
    setZone({ left, width })
    setResult(null)
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

  const duration = Math.max(MIN_DURATION, BASE_DURATION - score * DURATION_STEP)

  return (
    <div className="pop-art-theme" style={{ color: 'var(--pop-white)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="pop-headline text-xl">Penalty Shootout</p>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold" style={{ color: 'var(--pop-green)' }}>{score}</p>
          <p className="font-mono text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
            best: {bestScore ?? '—'}
          </p>
        </div>
      </div>

      {/* Goal — plain CSS shapes, no external artwork. Deliberately simple:
          three white bars for the frame, a dark rounded keeper shape
          fixed centre, a ball that hops to wherever the shot landed. */}
      <div
        className="relative rounded-xl mb-4"
        style={{ background: 'var(--pop-surface)', border: '2px solid rgba(255,255,255,0.12)', height: 180, overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, border: '6px solid rgba(255,255,255,0.85)', borderBottom: 'none', borderRadius: '4px 4px 0 0' }} />
        <div
          className="pop-goalkeeper"
          style={{
            position: 'absolute', bottom: 16, left: '50%', width: 34, height: 46,
            background: 'var(--pop-black)', border: '2px solid rgba(255,255,255,0.6)', borderRadius: '10px 10px 4px 4px',
            transform: 'translateX(-50%)', transition: 'left 0.35s ease',
            ...(result === 'miss' ? { left: `${zone.left + zone.width / 2}%` } : {}),
          }}
        />
        <div
          className={`pop-shoot-ball ${result === 'goal' ? 'pop-pop-in' : ''}`}
          style={{
            position: 'absolute', bottom: 16, width: 18, height: 18, borderRadius: '50%',
            background: 'var(--pop-white)', border: '2px solid var(--pop-black)',
            left: result ? `calc(${zone.left + zone.width / 2}% - 9px)` : 'calc(50% - 9px)',
            transition: 'left 0.4s ease, bottom 0.4s ease',
            ...(result ? { bottom: 90 } : {}),
          }}
        />
        {result && (
          <p
            className="pop-headline"
            style={{
              position: 'absolute', top: 8, left: 0, right: 0, textAlign: 'center', fontSize: 22,
              color: result === 'goal' ? 'var(--pop-green)' : 'var(--pop-red)',
              textShadow: `0 0 12px ${result === 'goal' ? 'rgba(0,230,118,0.6)' : 'rgba(232,38,42,0.6)'}`,
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
            background: 'rgba(0,230,118,0.35)',
            boxShadow: '0 0 10px rgba(0,230,118,0.5)',
          }}
        />
        <div
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

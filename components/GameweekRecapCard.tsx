'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'

type BestResult = {
  team: string
  opponent: string
  teamScore: number
  opponentScore: number
  isHome: boolean
  teamPoints: number
} | null

type ScoreRow = { name: string; points: number }

type Props = {
  competitionName: string
  gameweekNumber: number
  winner: { name: string; points: number } | null
  runnerUp: { name: string; points: number } | null
  totalPoints: number
  bestResult: BestResult
  fullScores: ScoreRow[]
  isFinal: boolean
  onClose: () => void
}

export default function GameweekRecapCard({ competitionName, gameweekNumber, winner, runnerUp, totalPoints, bestResult, fullScores, isFinal, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleShare() {
    if (!cardRef.current) return
    setSaving(true)
    setError(null)
    try {
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 })
      const filename = `gameweek-${gameweekNumber}-recap.png`

      // On mobile this opens the native share sheet (WhatsApp, Messages,
      // etc.) straight from the image — falls back to a plain download
      // wherever the Web Share API for files isn't available (most desktops).
      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      if (canShareFiles) {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], filename, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `Gameweek ${gameweekNumber} Recap` })
          setSaving(false)
          return
        }
      }

      const link = document.createElement('a')
      link.href = dataUrl
      link.download = filename
      link.click()
    } catch {
      setError('Could not generate the image — try again.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="w-full max-w-xs" onClick={e => e.stopPropagation()}>

        <div ref={cardRef} className="relative shadow-2xl" style={{ backgroundColor: '#F5ECD9', color: '#241a12' }}>
          <div className="absolute -top-2 left-0 right-0 flex justify-between px-1" style={{ height: '16px' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-full" style={{ width: '10px', height: '10px', backgroundColor: '#1e1914' }} />
            ))}
          </div>

          <div className="px-5 pt-6 pb-4 text-center border-b-2 border-dashed" style={{ borderColor: '#241a1733' }}>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: '#B5493C' }}>{competitionName}</p>
            <p className="text-xl font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-heading), serif' }}>Gameweek Recap</p>
            <p className="text-xs uppercase tracking-widest mt-1" style={{ color: '#241a1799' }}>Gameweek {gameweekNumber}</p>
            {!isFinal && (
              <p className="text-[9px] uppercase tracking-widest mt-1 font-bold" style={{ color: '#B5493C' }}>Live — not final</p>
            )}
          </div>

          <div className="px-5 py-4 space-y-3">
            {winner && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>🏆 Winner</span>
                <span className="font-bold uppercase text-sm text-right">{winner.name} · {winner.points} pts</span>
              </div>
            )}
            {runnerUp && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>🥈 Runner-up</span>
                <span className="font-bold uppercase text-sm text-right">{runnerUp.name} · {runnerUp.points} pts</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>Total Points Scored</span>
              <span className="font-bold uppercase text-sm">{totalPoints}</span>
            </div>
            {bestResult && (
              <div className="pt-1">
                <span className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: '#241a1799' }}>🔥 Best Team Result</span>
                <span className="font-bold uppercase text-sm block">
                  {bestResult.team} {bestResult.teamScore}-{bestResult.opponentScore} {bestResult.opponent} ({bestResult.isHome ? 'H' : 'A'})
                </span>
                <span className="text-xs" style={{ color: '#241a1799' }}>Earned {bestResult.teamPoints} team points</span>
              </div>
            )}
          </div>

          {fullScores.length > 0 && (
            <div className="px-5 pb-4 pt-1 border-t-2 border-dashed" style={{ borderColor: '#241a1733' }}>
              <p className="text-[10px] uppercase tracking-widest mt-3 mb-2 font-bold" style={{ color: '#241a1799' }}>Full Scores</p>
              <div className="space-y-1">
                {fullScores.map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="uppercase">{i + 1}. {row.name}</span>
                    <span className="font-bold">{row.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="relative border-t-2 border-dashed" style={{ borderColor: '#241a1733' }}>
            <div className="absolute -left-2 -top-2 rounded-full" style={{ width: '16px', height: '16px', backgroundColor: '#1e1914' }} />
            <div className="absolute -right-2 -top-2 rounded-full" style={{ width: '16px', height: '16px', backgroundColor: '#1e1914' }} />
          </div>

          <div className="px-5 py-3 text-center">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: '#241a1799' }}>LMS All-Stars Predictions</p>
          </div>

          <div className="absolute -bottom-2 left-0 right-0 flex justify-between px-1" style={{ height: '16px' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-full" style={{ width: '10px', height: '10px', backgroundColor: '#1e1914' }} />
            ))}
          </div>
        </div>

        {error && <p className="text-red-300 text-xs text-center mt-3">{error}</p>}

        <button
          onClick={handleShare}
          disabled={saving}
          className="w-full rounded-lg py-3 mt-5 font-bold uppercase tracking-wider text-sm shadow-lg disabled:opacity-60"
          style={{ backgroundColor: '#D9A441', color: '#241a12', fontFamily: 'var(--font-heading), serif' }}
        >
          {saving ? 'Preparing...' : 'Share / Save Image'}
        </button>
        <button
          onClick={onClose}
          className="w-full rounded-lg py-2.5 mt-2 font-bold uppercase tracking-wider text-xs"
          style={{ color: '#F5ECD9' }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

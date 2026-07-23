'use client'

import TicketModal from './TicketModal'

type BestResult = {
  team: string
  opponent: string
  teamScore: number
  opponentScore: number
  isHome: boolean
  teamPoints: number
} | null

type ScoreRow = { name: string; points: number }
type PollOption = { label: string; count: number }

type Props = {
  competitionName: string
  gameweekNumber: number
  winner: { name: string; points: number } | null
  runnerUp: { name: string; points: number } | null
  totalPoints: number
  bestResult: BestResult
  fullScores: ScoreRow[]
  isFinal: boolean
  questionText?: string | null
  questionPoll?: PollOption[]
  onClose: () => void
}

export default function GameweekRecapCard({ competitionName, gameweekNumber, winner, runnerUp, totalPoints, bestResult, fullScores, isFinal, questionText, questionPoll, onClose }: Props) {
  return (
    <TicketModal
      eyebrow={competitionName}
      title="Gameweek Recap"
      subtitle={`Gameweek ${gameweekNumber}${isFinal ? '' : ' — Live, not final'}`}
      filenameBase={`gameweek-${gameweekNumber}-recap`}
      onClose={onClose}
    >
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

      {questionText && questionPoll && questionPoll.length > 0 && (
        <div className="px-5 pb-4 pt-1 border-t-2 border-dashed" style={{ borderColor: '#241a1733' }}>
          <p className="text-[10px] uppercase tracking-widest mt-3 mb-2 font-bold" style={{ color: '#241a1799' }}>{questionText}</p>
          <div className="space-y-1">
            {questionPoll.map((opt, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="uppercase">{opt.label}</span>
                <span className="font-bold">{opt.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </TicketModal>
  )
}

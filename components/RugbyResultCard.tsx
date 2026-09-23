import { rugbyTeamGradient } from './rugbyTeamColors'

export default function RugbyResultCard({
  homeName, homeCode, homeScore, awayName, awayCode, awayScore, tag,
}: {
  homeName: string
  homeCode: string | null
  homeScore: number
  awayName: string
  awayCode: string | null
  awayScore: number
  tag?: string
}) {
  const homeWon = homeScore > awayScore
  const awayWon = awayScore > homeScore
  return (
    <div className="rugby-ft-wrap">
      {tag && <div className="rugby-ft-tag">{tag}</div>}
      <div className="rugby-result-card">
        <span className="rugby-flagbar" style={{ background: rugbyTeamGradient(homeCode) }} />
        <div className="rugby-rt-team"><span className="rugby-rt-name">{homeName}</span></div>
        <div className="rugby-rt-score">
          <span className={homeWon ? 'rugby-rt-win' : undefined}>{homeScore}</span>
          <span className="rugby-rt-dash">&ndash;</span>
          <span className={awayWon ? 'rugby-rt-win' : undefined}>{awayScore}</span>
        </div>
        <div className="rugby-rt-team rugby-rt-away"><span className="rugby-rt-name">{awayName}</span></div>
        <span className="rugby-flagbar" style={{ background: rugbyTeamGradient(awayCode) }} />
      </div>
    </div>
  )
}

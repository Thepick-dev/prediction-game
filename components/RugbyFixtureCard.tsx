import { rugbyTeamGradient } from './rugbyTeamColors'

// The matchday banner: two skewed team-colour panels meeting at a rugby-
// ball VS badge. Shape lives in .rugby-fx-bg (absolutely positioned,
// clipped); the team name sits in a normal unclipped box on top, so a
// long name (SCOTLAND, ENGLAND) can never be sliced by the clip-path —
// see the rugby-skin-concept artifact for the bug this design avoids.
export default function RugbyFixtureCard({
  homeName, homeCode, awayName, awayCode, meta, href,
}: {
  homeName: string
  homeCode: string | null
  awayName: string
  awayCode: string | null
  meta?: { left: string; right?: string }
  href?: string
}) {
  const content = (
    <>
      <div className="rugby-fx-row">
        <div className="rugby-fx-side rugby-fx-home">
          <div className="rugby-fx-bg" style={{ background: rugbyTeamGradient(homeCode) }} />
          <div className="rugby-fx-label">{homeName}</div>
        </div>
        <div className="rugby-fx-mid"><div className="rugby-vs-badge"><span>VS</span></div></div>
        <div className="rugby-fx-side rugby-fx-away">
          <div className="rugby-fx-bg" style={{ background: rugbyTeamGradient(awayCode) }} />
          <div className="rugby-fx-label">{awayName}</div>
        </div>
      </div>
      {meta && (
        <div className="rugby-fx-meta">
          <span>{meta.left}</span>
          {meta.right && <span className="rugby-fx-venue">{meta.right}</span>}
        </div>
      )}
    </>
  )

  if (href) {
    return <a href={href} className="block no-underline" style={{ color: 'inherit' }}>{content}</a>
  }
  return <div>{content}</div>
}

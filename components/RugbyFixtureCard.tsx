import { rugbyTeamGradient } from './rugbyTeamColors'

// The upcoming-fixture card — deliberately as quiet as the finished
// RugbyResultCard (dark chamfered panel, thin team-colour flagbars down
// each edge) rather than the old full-bleed diagonal team-colour blocks:
// a results page with fifteen of those stacked up, and nothing else to
// look at yet, read as loud and carnival-ish rather than as part of the
// same design as the rest of the site.
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
      <div className="rugby-result-card">
        <span className="rugby-flagbar" style={{ background: rugbyTeamGradient(homeCode) }} />
        <div className="rugby-rt-team"><span className="rugby-rt-name">{homeName}</span></div>
        <div className="rugby-fx-quiet-mid"><div className="rugby-vs-badge"><span>VS</span></div></div>
        <div className="rugby-rt-team rugby-rt-away"><span className="rugby-rt-name">{awayName}</span></div>
        <span className="rugby-flagbar" style={{ background: rugbyTeamGradient(awayCode) }} />
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

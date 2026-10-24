'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import FitName from '../../components/FitName'
import GhostVisibilityNotice, { useGhostVisibilityNotice } from '../../components/GhostVisibilityNotice'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../lib/players'

type Row = {
  userId: string
  name: string
  isBot: boolean
  isOwnRow: boolean
  isGhost: boolean
  kit: { pattern: string; colour1: string; colour2: string; colour3: string | null } | null
  team: string
  teamId: number
  teamPoints: number | null
  isBanker: boolean
  isAutopick: boolean
  player1Name: string
  player1Points: number | null
  player1Goals: number
  player1Assists: number
  player2Name: string
  player2Points: number | null
  player2Goals: number
  player2Assists: number
  aon: { onPlayer1: boolean; onPlayer2: boolean; outcome: 'pending' | 'success' | 'failed' } | null
  bonusCard: { playerName: string; points: number | null } | null
  weeklyPoints: number | null
  cumulativeTotal: number
  movement: number
}

// Identical visual language to ResultsGrid (app/results/ResultsGrid.tsx) —
// same colours, same "just the word AON" pill, same StatRow shape — so the
// two pages read as one system. Duplicated rather than imported (same
// precedent as AON_PILL below already being duplicated between the two
// files) since each page owns its own independent data-fetching.
const AON_PILL = {
  success: { bg: 'var(--pop-green)', fg: 'var(--pop-black)' },
  failed: { bg: 'var(--pop-red)', fg: '#fff' },
  pending: { bg: 'rgba(255,255,255,0.18)', fg: 'rgba(255,255,255,0.75)' },
} as const

function AonPill({ outcome }: { outcome?: 'pending' | 'success' | 'failed' }) {
  if (!outcome) return null
  const { bg, fg } = AON_PILL[outcome]
  return (
    <span
      className="shrink-0 rounded-full font-black uppercase"
      style={{ fontSize: '8px', padding: '2px 6px', background: bg, color: fg, letterSpacing: '0.03em' }}
      title={`All or Nothing — ${outcome === 'pending' ? 'played, result not known yet' : outcome}`}
    >
      AON
    </span>
  )
}

// One label:points row — "—" rather than 0 whenever there's genuinely
// nothing to show yet (scoring not live, or — for the Bonus Card row
// specifically — simply not played that week), so a real 0 stays visually
// distinct from "nothing happened here at all." Same component as
// ResultsGrid's StatRow, same reason: no crests, no G/A badges, nothing
// layered on top of exactly what was asked for.
function StatRow({ label, value, color, pill, bold }: {
  label: string; value: number | null; color: string; pill?: React.ReactNode; bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2" style={{ lineHeight: 1.15 }}>
      <span className="min-w-0 flex-1 flex items-center gap-1.5">
        <FitName
          baseSize={11} minSize={9} className="uppercase font-bold"
          style={{ color: bold ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.7)', letterSpacing: bold ? '0.03em' : undefined }}
        >
          {label}
        </FitName>
        {pill}
      </span>
      <span className="shrink-0 font-mono font-black" style={{ fontSize: '12px', color, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// A mobile-native "how's everyone doing right now" view for a locked/live
// gameweek — its own component since it owns independent data-fetching and
// live polling that ResultsGrid (purely presentational, fed by its page)
// doesn't need. Same card chrome and row language as ResultsGrid though,
// deliberately, so the two pages read as one system rather than two that
// happen to share a colour scheme.
export default function LiveGameweekTable({
  competitionId, gameweekId, gameweekStatus, currentUserId, gridRef,
}: {
  competitionId: string
  gameweekId: string
  gameweekStatus: string
  currentUserId: string | undefined
  // Owned by the parent page now, not this component — the Share button
  // lives in the page's own gameweek panel (GW number, next deadline,
  // Share, all in one place) rather than a second header repeating the
  // GW number here. This component just needs to know which node to
  // capture an image of.
  gridRef: React.RefObject<HTMLDivElement | null>
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [bonusCardName, setBonusCardName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Hidden from everyone but themselves by default — same reasoning and
  // same shared notice as the Results/Leaderboard "show ghost players"
  // toggle (see GhostVisibilityNotice.tsx): a ghost's backfilled total
  // mixed into "who picked what" is misleading unless you opt in.
  const [showGhosts, setShowGhosts] = useState(false)
  const ghostVisibilityNotice = useGhostVisibilityNotice()
  const supabase = createClient()

  useEffect(() => {
    loadData()
    // A still-live gameweek keeps changing underneath whoever's looking at
    // this — goals, assists, results — so it re-polls on its own rather than
    // only ever refreshing on a manual page reload. Stops once the gameweek
    // is completed: nothing left to move by then.
    if (gameweekStatus === 'completed') return
    const interval = setInterval(() => loadData(true), 60000)
    return () => clearInterval(interval)
  }, [gameweekId, gameweekStatus])

  // `background` skips the loading placeholder — a poll refresh should
  // quietly swap the numbers in place, not flash the whole table away and
  // back every minute.
  async function loadData(background = false) {
    if (!background) setLoading(true)

    const [
      { data: entries },
      { data: picksData },
      { data: profilesData },
      { data: teamsData },
      { data: playersData },
      { data: allPointsData },
      { data: fixturesData },
      { data: aonRows },
      { data: bonusCardRows },
      { data: seasonBonusCardData },
      { data: comp },
    ] = await Promise.all([
      supabase.from('competition_entries').select('user_id, is_ghost').eq('competition_id', competitionId).eq('removed', false),
      supabase.from('picks').select('id, user_id, team_id, player1_id, player2_id, is_banker, is_autopick').eq('gameweek_id', gameweekId),
      supabase.from('profiles').select('id, display_name, kit_pattern, kit_colour_1, kit_colour_2, kit_colour_3, is_bot'),
      supabase.from('teams').select('id, name, short_name, short_code'),
      supabase.from('players').select('id, name, web_name, team_id'),
      supabase.from('points').select('pick_id, user_id, total_points, team_points, player1_points, player2_points, breakdown').eq('competition_id', competitionId),
      supabase.from('fixtures').select('id').eq('gameweek_id', gameweekId),
      supabase.from('all_or_nothing_picks').select('user_id, player_id, outcome').eq('gameweek_id', gameweekId),
      supabase.from('bonus_card_plays').select('user_id, player_id, points').eq('gameweek_id', gameweekId),
      supabase.from('bonus_card_plays').select('user_id, points').eq('competition_id', competitionId),
      supabase.from('competitions').select('bonus_card_name, bonus_card_player_id').eq('id', competitionId).single(),
    ])

    const activeUserIds = new Set((entries ?? []).map(e => e.user_id))
    const isGhostByUser: Record<string, boolean> = {}
    entries?.forEach(e => { isGhostByUser[e.user_id] = e.is_ghost ?? false })
    const profileMap: Record<string, { name: string; isBot: boolean; kit: Row['kit'] }> = {}
    profilesData?.forEach(p => {
      profileMap[p.id] = {
        name: p.display_name ?? 'Unknown',
        isBot: p.is_bot ?? false,
        kit: { pattern: p.kit_pattern ?? 'solid', colour1: p.kit_colour_1 ?? '#1E4D6B', colour2: p.kit_colour_2 ?? '#F5ECD9', colour3: p.kit_colour_3 ?? null },
      }
    })

    const teamMap: Record<number, { name: string; short_name: string | null; short_code: string | null }> = {}
    teamsData?.forEach(t => { teamMap[t.id] = t })

    const playerMap = buildPlayerDisplayNames(playersData ?? [], {})

    const fixtureIds = (fixturesData ?? []).map(f => f.id)
    const { data: events } = fixtureIds.length > 0
      ? await supabase.from('match_events').select('player_id, event_type').in('fixture_id', fixtureIds)
      : { data: [] as { player_id: number; event_type: string }[] }
    const goalCountByPlayer: Record<number, number> = {}
    const assistCountByPlayer: Record<number, number> = {}
    ;(events ?? []).forEach(e => {
      if (e.event_type === 'goal') goalCountByPlayer[e.player_id] = (goalCountByPlayer[e.player_id] ?? 0) + 1
      if (e.event_type === 'assist') assistCountByPlayer[e.player_id] = (assistCountByPlayer[e.player_id] ?? 0) + 1
    })

    const realPickUserIds = new Set((picksData ?? []).map(p => p.user_id))

    // Cumulative totals need every gameweek's real points PLUS a live
    // preview for this one specifically if it hasn't been scored for real
    // yet — same merge-by-pick_id approach the Leaderboard already uses
    // (and already had a live-preview gap bug fixed in, earlier this
    // session), so this deliberately mirrors it rather than risking the
    // same mistake twice.
    //
    // One call to /api/scoring/preview covers both the live points AND
    // the autopick previews for whoever hasn't picked yet — it derives
    // those internally anyway, so a separate /api/autopick/preview call
    // would just be re-doing the exact same work a second time.
    const pointsByPickId: Record<string, { user_id: string; total_points: number | null; team_points: number | null; player1_points: number | null; player2_points: number | null; breakdown: any }> = {}
    allPointsData?.forEach(p => { pointsByPickId[p.pick_id] = p })
    let liveBonusCardRows: { user_id: string; points: number }[] = []
    let previewPicks: typeof picksData = []
    if (gameweekStatus !== 'completed') {
      try {
        const previewScoringRes = await fetch(`/api/scoring/preview?gameweek_id=${gameweekId}`)
        const previewScoringData = await previewScoringRes.json()
        ;(previewScoringData.rows ?? []).forEach((row: any) => { pointsByPickId[row.pick_id] = row })
        liveBonusCardRows = previewScoringData.bonusCardRows ?? []
        previewPicks = Object.entries(previewScoringData.previews ?? {})
          .filter(([userId]) => !realPickUserIds.has(userId))
          .map(([userId, p]: [string, any]) => ({
            id: `preview-${userId}`, user_id: userId, team_id: p.team_id,
            player1_id: p.player1_id, player2_id: p.player2_id, is_banker: false, is_autopick: true,
          }))
      } catch { /* leave real points/picks as-is */ }
    }
    const allPicksThisGw = [...(picksData ?? []), ...previewPicks].filter(p => activeUserIds.has(p.user_id))
    const liveBonusCardByUser: Record<string, number> = {}
    liveBonusCardRows.forEach(r => { liveBonusCardByUser[r.user_id] = r.points })

    const cumulativeByUser: Record<string, number> = {}
    Object.values(pointsByPickId).forEach(p => {
      cumulativeByUser[p.user_id] = (cumulativeByUser[p.user_id] ?? 0) + (p.total_points ?? 0)
    })

    // Bonus Card points never touch the `points` table (see resolveBonusCard),
    // so they're added on separately — resolved plays from any gameweek this
    // season (summed, not just the latest — a competition can allow more
    // than one play), plus a live preview for THIS gameweek's play
    // specifically if it hasn't been resolved yet (mirrors the
    // Leaderboard's own total). `points` stays null on an unresolved play,
    // so a still-live current-gameweek play is never double-counted here.
    const bonusCardTotalByUser: Record<string, number> = {}
    seasonBonusCardData?.forEach(p => { if (p.points != null) bonusCardTotalByUser[p.user_id] = (bonusCardTotalByUser[p.user_id] ?? 0) + p.points })
    if (gameweekStatus !== 'completed') {
      Object.entries(liveBonusCardByUser).forEach(([userId, points]) => {
        bonusCardTotalByUser[userId] = (bonusCardTotalByUser[userId] ?? 0) + points
      })
    }
    Object.entries(bonusCardTotalByUser).forEach(([userId, points]) => {
      cumulativeByUser[userId] = (cumulativeByUser[userId] ?? 0) + points
    })

    const aonByUser: Record<string, { player_id: number; outcome: string }> = {}
    aonRows?.forEach(a => { aonByUser[a.user_id] = a })
    const bonusCardByUser: Record<string, { player_id: number; points: number | null }> = {}
    bonusCardRows?.forEach(b => { bonusCardByUser[b.user_id] = b })

    const builtRows: Row[] = allPicksThisGw.map(pick => {
      const profile = profileMap[pick.user_id]
      const t = teamMap[pick.team_id]
      const aon = aonByUser[pick.user_id]
      const bonusCardPlay = bonusCardByUser[pick.user_id]
      const pts = pointsByPickId[pick.id]

      // The stored outcome only flips from "pending" once a real scoring run
      // resolves it (see resolveAllOrNothing) — for a still-live gameweek
      // that lags behind what's actually happened. Safe to upgrade to
      // "success" live the moment the nominated player has scored/assisted
      // (that can never be undone); never invent "failed" early, since the
      // match may still be in progress.
      let aonOutcome = aon?.outcome as 'pending' | 'success' | 'failed' | undefined
      if (aon && aonOutcome === 'pending') {
        const raw = aon.player_id === pick.player1_id ? pts?.breakdown?.player1_raw
          : aon.player_id === pick.player2_id ? pts?.breakdown?.player2_raw
          : null
        if (raw != null && raw > 0) aonOutcome = 'success'
      }

      const bonusCardPoints = bonusCardPlay
        ? (bonusCardPlay.points ?? (gameweekStatus !== 'completed' ? liveBonusCardByUser[pick.user_id] ?? null : null))
        : null

      return {
        userId: pick.user_id,
        name: profile?.name ?? 'Unknown',
        isBot: profile?.isBot ?? false,
        isOwnRow: pick.user_id === currentUserId,
        isGhost: isGhostByUser[pick.user_id] ?? false,
        kit: profile?.kit ?? null,
        team: t ? (t.short_code ?? t.short_name ?? t.name) : '?',
        teamId: pick.team_id,
        teamPoints: pts?.team_points ?? null,
        isBanker: pick.is_banker,
        isAutopick: !!pick.is_autopick,
        player1Name: playerMap[pick.player1_id] ?? 'Unknown',
        player1Points: pts?.player1_points ?? null,
        player1Goals: goalCountByPlayer[pick.player1_id] ?? 0,
        player1Assists: assistCountByPlayer[pick.player1_id] ?? 0,
        player2Name: playerMap[pick.player2_id] ?? 'Unknown',
        player2Points: pts?.player2_points ?? null,
        player2Goals: goalCountByPlayer[pick.player2_id] ?? 0,
        player2Assists: assistCountByPlayer[pick.player2_id] ?? 0,
        aon: aon ? { onPlayer1: aon.player_id === pick.player1_id, onPlayer2: aon.player_id === pick.player2_id, outcome: aonOutcome ?? 'pending' } : null,
        bonusCard: bonusCardPlay ? { playerName: playerMap[bonusCardPlay.player_id] ?? 'Unknown', points: bonusCardPoints } : null,
        weeklyPoints: pts?.total_points != null ? pts.total_points + (bonusCardPoints ?? 0) : null,
        cumulativeTotal: cumulativeByUser[pick.user_id] ?? 0,
        movement: 0,
      }
    })

    // Cumulative total, highest first — this panel is about "how's
    // everyone doing overall", not just this week's scramble.
    builtRows.sort((a, b) => b.cumulativeTotal - a.cumulativeTotal)

    // "Movement" = how many places this gameweek's points have shuffled
    // someone up or down the overall standings, comparing today's ranking
    // against what it would've been going into this gameweek (total minus
    // this week's own points). Purely a re-derivation of data already on
    // the row — no extra fetch, no stored "last seen" snapshot needed.
    const rankedBeforeThisGw = [...builtRows].sort((a, b) =>
      (b.cumulativeTotal - (b.weeklyPoints ?? 0)) - (a.cumulativeTotal - (a.weeklyPoints ?? 0))
    )
    const rankBeforeByUser: Record<string, number> = {}
    rankedBeforeThisGw.forEach((row, idx) => { rankBeforeByUser[row.userId] = idx + 1 })
    builtRows.forEach((row, idx) => { row.movement = rankBeforeByUser[row.userId] - (idx + 1) })

    setRows(builtRows)
    setBonusCardName(bonusCardDisplayName(comp?.bonus_card_name, comp?.bonus_card_player_id != null ? playerMap[comp.bonus_card_player_id] : null))
    setLoading(false)
  }

  if (loading) {
    return <div className="pop-panel p-6 text-center"><p className="font-bold text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading gameweek…</p></div>
  }

  if (rows.length === 0) {
    return null
  }

  // Same "final / live / locked" status language as Results — the GW
  // number itself already sits in the page's own panel just above this,
  // so it isn't repeated here, but the live/final state wasn't shown
  // anywhere on Picks before this and is genuinely useful to know.
  const final = gameweekStatus === 'completed'
  const live = !final && rows.some(r => (r.weeklyPoints ?? 0) > 0)

  return (
    <>
      <div ref={gridRef} className="pop-panel" style={{ overflow: 'hidden', padding: '16px 10px' }}>
        <p className="font-black uppercase mb-3" style={{ fontSize: '12px', letterSpacing: '0.04em', color: final ? 'var(--pop-green)' : live ? '#FA6100' : 'rgba(255,255,255,0.4)' }}>
          {final ? '✅ Final Result' : live ? '🔴 Live — scores updating' : '🔒 Picks locked in'}
        </p>

        {rows.map((row, i) => {
          // Rank numbers come from the FULL list (real players + ghosts),
          // same reasoning as Results/Leaderboard — a ghost existing still
          // counts toward everyone else's position even while hidden, so
          // the numbering never shifts depending on the viewer's own toggle.
          if (row.isGhost && !showGhosts && !row.isOwnRow) return null
          const rowBg = row.isOwnRow ? 'rgba(160,0,250,0.06)' : (i % 2 === 1 ? 'rgba(255,255,255,0.035)' : undefined)
          return (
          <div key={row.userId} style={{ background: rowBg, padding: '7px 10px', borderRadius: 10 }}>
            {/* Header — shirt + name, both big and striking, same
                treatment as the Leaderboard and the Results cards. Rank
                and gameweek movement stay small since they're secondary
                to "whose row is this." */}
            <div className="flex items-center gap-1.5 mb-1">
              <span className="shrink-0 font-black" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>{i + 1}</span>
              {row.movement !== 0 && (
                <span
                  className="font-mono font-black shrink-0 inline-flex items-center"
                  style={{ fontSize: '9px', color: row.movement > 0 ? 'var(--pop-green)' : 'var(--pop-red)' }}
                  title={row.movement > 0 ? `Up ${row.movement} place${row.movement === 1 ? '' : 's'} this gameweek` : `Down ${Math.abs(row.movement)} place${Math.abs(row.movement) === 1 ? '' : 's'} this gameweek`}
                >
                  {row.movement > 0 ? '▲' : '▼'}{Math.abs(row.movement)}
                </span>
              )}
              {row.isBot ? <BotAvatar size={30} /> : (
                <span className="shrink-0">
                  <KitBadge pattern={row.kit?.pattern ?? 'solid'} colour1={row.kit?.colour1 ?? '#1E4D6B'} colour2={row.kit?.colour2 ?? '#F5ECD9'} colour3={row.kit?.colour3} size={30} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <FitName
                  baseSize={18} minSize={12} className="pop-name"
                  style={{
                    color: row.isOwnRow ? 'var(--pop-pink)' : '#fff',
                    textShadow: row.isOwnRow
                      ? '0 0 4px rgba(160,0,250,0.55), 0 0 12px rgba(160,0,250,0.3)'
                      : '0 0 4px rgba(0,174,239,0.5), 0 0 12px rgba(0,174,239,0.28)',
                  }}
                >
                  {row.name}
                </FitName>
                {row.isAutopick && <div className="normal-case font-bold" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)' }}>Autopick — deadline missed</div>}
              </span>
              {row.isBanker && (
                <span
                  className="shrink-0 inline-flex items-center justify-center rounded-full font-black"
                  style={{ width: 20, height: 20, fontSize: '10px', background: 'var(--pop-orange)', color: '#fff' }}
                  title="Banker — team and both players doubled this week"
                >
                  ★
                </span>
              )}
            </div>

            {/* The rows, left side; grand total standing alone, big, right */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <StatRow label={row.team} value={row.teamPoints} color="var(--pop-blue)" />
                <StatRow
                  label={row.player1Name}
                  value={row.player1Points}
                  color="var(--pop-yellow)"
                  pill={row.aon?.onPlayer1 ? <AonPill outcome={row.aon.outcome} /> : undefined}
                />
                <StatRow
                  label={row.player2Name}
                  value={row.player2Points}
                  color="var(--pop-yellow)"
                  pill={row.aon?.onPlayer2 ? <AonPill outcome={row.aon.outcome} /> : undefined}
                />
                {row.bonusCard && (
                  <StatRow label={bonusCardName ?? 'Bonus Card'} value={row.bonusCard.points} color="var(--pop-yellow)" />
                )}
                <div style={{ marginTop: 1, paddingTop: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <StatRow label="This Week" value={row.weeklyPoints} color="rgba(255,255,255,0.6)" bold />
                </div>
              </div>

              <div className="shrink-0 flex items-center">
                <span className="font-black font-mono" style={{ fontSize: '28px', color: 'var(--pop-green)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {row.cumulativeTotal}
                </span>
              </div>
            </div>
          </div>
          )
        })}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center justify-center rounded-full font-black" style={{ width: 13, height: 13, fontSize: '9px', background: 'var(--pop-orange)', color: '#fff' }}>★</span>
            Banker
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="rounded-full font-black uppercase" style={{ fontSize: '8px', padding: '2px 6px', background: 'var(--pop-green)', color: 'var(--pop-black)' }}>AON</span>
            <span className="rounded-full font-black uppercase" style={{ fontSize: '8px', padding: '2px 6px', background: 'var(--pop-red)', color: '#fff' }}>AON</span>
            <span className="rounded-full font-black uppercase" style={{ fontSize: '8px', padding: '2px 6px', background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.75)' }}>AON</span>
            All or Nothing — green/grey/red = succeeded/pending/failed
          </span>
        </div>
      </div>
      {rows.some(r => r.isGhost) && (
        <button
          type="button"
          onClick={() => {
            setShowGhosts(v => {
              const next = !v
              if (next) ghostVisibilityNotice.maybeShow()
              return next
            })
          }}
          className="font-bold uppercase tracking-wider mt-2 block"
          style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}
        >
          👻 {showGhosts ? 'Hide' : 'Show'} ghost players
        </button>
      )}
      <GhostVisibilityNotice visible={ghostVisibilityNotice.visible} onMinimise={ghostVisibilityNotice.minimise} onDismissForever={ghostVisibilityNotice.dismissForever} />
    </>
  )
}

'use client'

import { useState, useEffect, useRef } from 'react'
import { toPng } from 'html-to-image'
import { createClient } from '../lib/supabase'
import TeamCrest from '../../components/TeamCrest'
import KitBadge from '../../components/KitBadge'
import BotAvatar from '../../components/BotAvatar'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../lib/players'

type Row = {
  userId: string
  name: string
  isBot: boolean
  isOwnRow: boolean
  kit: { pattern: string; colour1: string; colour2: string; colour3: string | null } | null
  team: string
  teamId: number
  teamPoints: number | null
  isBanker: boolean
  isAutopick: boolean
  player1Name: string
  player1Points: number | null
  player1Goal: boolean
  player1Assist: boolean
  player2Name: string
  player2Points: number | null
  player2Goal: boolean
  player2Assist: boolean
  aon: { onPlayer1: boolean; onPlayer2: boolean; outcome: 'pending' | 'success' | 'failed' } | null
  bonusCard: { playerName: string; points: number | null } | null
  weeklyPoints: number | null
  cumulativeTotal: number
}

const aonBg = { pending: '#A000FA', success: '#CCFA00', failed: '#FA003C' } as const
const aonLabel = { pending: 'AoN', success: 'AoN ✓', failed: 'AoN ✕' } as const

// Small right-aligned points readout reused for the team/player1/player2/
// bonus card lines — "—" (not "0") while a value genuinely isn't known yet
// (no pick, or the preview call failed), matching the header's own total.
function PtsPill({ value, doubled }: { value: number | null; doubled?: boolean }) {
  return (
    <span className="font-mono font-black shrink-0 whitespace-nowrap" style={{ fontSize: '12px', color: value === null ? 'rgba(255,255,255,0.3)' : value > 0 ? 'var(--pop-green)' : 'rgba(255,255,255,0.4)' }}>
      {value === null ? '—' : `${value > 0 ? '+' : ''}${value}`}
      {doubled && value !== null && <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}> ×2</span>}
    </span>
  )
}

// A mobile-native "how's everyone doing right now" view for a locked/live
// gameweek — deliberately NOT the ResultsGrid ticket (that one's fixed-width
// and built to be captured as a WhatsApp image, not read natively on a
// phone; forcing it into this page would need the exact horizontal-scroll
// its own design accepts as a tradeoff, which doesn't work here). This is a
// stacked card list instead — nothing side-by-side that could force a
// horizontal scroll, no matter how long a name or team gets.
export default function LiveGameweekTable({
  competitionId, competitionName, gameweekId, gameweekNumber, gameweekStatus, currentUserId,
}: {
  competitionId: string
  competitionName: string
  gameweekId: string
  gameweekNumber: number
  gameweekStatus: string
  currentUserId: string | undefined
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [bonusCardName, setBonusCardName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => { loadData() }, [gameweekId])

  async function loadData() {
    setLoading(true)

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
      supabase.from('competition_entries').select('user_id').eq('competition_id', competitionId).eq('removed', false),
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
    const goalIds = new Set((events ?? []).filter(e => e.event_type === 'goal').map(e => e.player_id))
    const assistIds = new Set((events ?? []).filter(e => e.event_type === 'assist').map(e => e.player_id))

    const realPickUserIds = new Set((picksData ?? []).map(p => p.user_id))
    let previewPicks: typeof picksData = []
    if (gameweekStatus !== 'completed') {
      try {
        const previewRes = await fetch(`/api/autopick/preview?gameweek_id=${gameweekId}`)
        const previewData = await previewRes.json()
        previewPicks = Object.entries(previewData.previews ?? {})
          .filter(([userId]) => !realPickUserIds.has(userId))
          .map(([userId, p]: [string, any]) => ({
            id: `preview-${userId}`, user_id: userId, team_id: p.team_id,
            player1_id: p.player1_id, player2_id: p.player2_id, is_banker: false, is_autopick: true,
          }))
      } catch { previewPicks = [] }
    }
    const allPicksThisGw = [...(picksData ?? []), ...previewPicks].filter(p => activeUserIds.has(p.user_id))

    // Cumulative totals need every gameweek's real points PLUS a live
    // preview for this one specifically if it hasn't been scored for real
    // yet — same merge-by-pick_id approach the Leaderboard already uses
    // (and already had a live-preview gap bug fixed in, earlier this
    // session), so this deliberately mirrors it rather than risking the
    // same mistake twice.
    const pointsByPickId: Record<string, { user_id: string; total_points: number | null; team_points: number | null; player1_points: number | null; player2_points: number | null; breakdown: any }> = {}
    allPointsData?.forEach(p => { pointsByPickId[p.pick_id] = p })
    let liveBonusCardRows: { user_id: string; points: number }[] = []
    if (gameweekStatus !== 'completed') {
      try {
        const previewScoringRes = await fetch(`/api/scoring/preview?gameweek_id=${gameweekId}`)
        const previewScoringData = await previewScoringRes.json()
        ;(previewScoringData.rows ?? []).forEach((row: any) => { pointsByPickId[row.pick_id] = row })
        liveBonusCardRows = previewScoringData.bonusCardRows ?? []
      } catch { /* leave real points as-is */ }
    }
    const liveBonusCardByUser: Record<string, number> = {}
    liveBonusCardRows.forEach(r => { liveBonusCardByUser[r.user_id] = r.points })

    const cumulativeByUser: Record<string, number> = {}
    Object.values(pointsByPickId).forEach(p => {
      cumulativeByUser[p.user_id] = (cumulativeByUser[p.user_id] ?? 0) + (p.total_points ?? 0)
    })

    // Bonus Card points never touch the `points` table (see resolveBonusCard),
    // so they're added on separately — resolved plays from any gameweek this
    // season, plus a live preview for THIS gameweek's play specifically if
    // it hasn't been resolved yet (mirrors the Leaderboard's own total).
    const bonusCardTotalByUser: Record<string, number> = {}
    seasonBonusCardData?.forEach(p => { if (p.points != null) bonusCardTotalByUser[p.user_id] = p.points })
    if (gameweekStatus !== 'completed') {
      Object.entries(liveBonusCardByUser).forEach(([userId, points]) => {
        if (bonusCardTotalByUser[userId] == null) bonusCardTotalByUser[userId] = points
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
        kit: profile?.kit ?? null,
        team: t ? (t.short_code ?? t.short_name ?? t.name) : '?',
        teamId: pick.team_id,
        teamPoints: pts?.team_points ?? null,
        isBanker: pick.is_banker,
        isAutopick: !!pick.is_autopick,
        player1Name: playerMap[pick.player1_id] ?? 'Unknown',
        player1Points: pts?.player1_points ?? null,
        player1Goal: goalIds.has(pick.player1_id),
        player1Assist: assistIds.has(pick.player1_id),
        player2Name: playerMap[pick.player2_id] ?? 'Unknown',
        player2Points: pts?.player2_points ?? null,
        player2Goal: goalIds.has(pick.player2_id),
        player2Assist: assistIds.has(pick.player2_id),
        aon: aon ? { onPlayer1: aon.player_id === pick.player1_id, onPlayer2: aon.player_id === pick.player2_id, outcome: aonOutcome ?? 'pending' } : null,
        bonusCard: bonusCardPlay ? { playerName: playerMap[bonusCardPlay.player_id] ?? 'Unknown', points: bonusCardPoints } : null,
        weeklyPoints: pts?.total_points ?? null,
        cumulativeTotal: cumulativeByUser[pick.user_id] ?? 0,
      }
    })

    // Cumulative total, highest first — this panel is about "how's
    // everyone doing overall", not just this week's scramble.
    builtRows.sort((a, b) => b.cumulativeTotal - a.cumulativeTotal)
    setRows(builtRows)
    setBonusCardName(bonusCardDisplayName(comp?.bonus_card_name, comp?.bonus_card_player_id != null ? playerMap[comp.bonus_card_player_id] : null))
    setLoading(false)
  }

  async function handleShare() {
    if (!gridRef.current) return
    setSharing(true)
    setShareError(null)
    try {
      const node = gridRef.current
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#0A0A0A', width: node.scrollWidth, height: node.scrollHeight })
      const filename = `${competitionName.replace(/\s+/g, '-').toLowerCase()}-gw${gameweekNumber}-live.png`
      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      if (canShareFiles) {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], filename, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `${competitionName} — Gameweek ${gameweekNumber}` })
          return
        }
      }
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = filename
      link.click()
      const text = encodeURIComponent(`${competitionName} — Gameweek ${gameweekNumber} 👀 (image saved — attach it here!)`)
      window.open(`https://wa.me/?text=${text}`, '_blank')
    } catch {
      setShareError('Could not generate the image — try again.')
    } finally {
      setSharing(false)
    }
  }

  if (loading) {
    return <div className="pop-panel p-6 text-center"><p className="font-bold text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Loading gameweek…</p></div>
  }

  if (rows.length === 0) {
    return null
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="pop-headline text-lg" style={{ color: 'var(--pop-blue)' }}>👀 How Everyone's Doing — GW{gameweekNumber}</p>
        <button
          onClick={handleShare}
          disabled={sharing}
          className="rounded px-3 py-1.5 text-xs font-bold shrink-0 disabled:opacity-50"
          style={{ backgroundColor: '#25D366', color: '#0b1a12' }}
        >
          {sharing ? 'Preparing…' : '📱 Share'}
        </button>
      </div>
      {shareError && <p className="text-xs mb-2" style={{ color: 'var(--pop-red)' }}>{shareError}</p>}

      <div ref={gridRef} className="rounded-2xl p-3 sm:p-4 space-y-2" style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.08)' }}>
        {rows.map((row, i) => (
          <div
            key={row.userId}
            className="rounded-xl p-2.5 sm:p-3"
            style={{
              background: row.isOwnRow ? 'rgba(160,0,250,0.1)' : 'rgba(255,255,255,0.03)',
              border: row.isOwnRow ? '1px solid rgba(160,0,250,0.4)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-black shrink-0" style={{ color: 'rgba(255,255,255,0.35)', fontSize: '12px' }}>{i + 1}</span>
                <span className="shrink-0">
                  {row.isBot ? <BotAvatar size={24} /> : <KitBadge pattern={row.kit?.pattern ?? 'solid'} colour1={row.kit?.colour1 ?? '#1E4D6B'} colour2={row.kit?.colour2 ?? '#F5ECD9'} colour3={row.kit?.colour3} size={24} />}
                </span>
                <span className="font-black uppercase truncate" style={{ fontSize: '13px' }}>{row.name}</span>
                {row.isAutopick && <span className="px-1 py-0.5 rounded font-black shrink-0" style={{ fontSize: '9px', background: 'rgba(255,255,255,0.15)' }} title="Autopicked">AP</span>}
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-black" style={{ fontSize: '18px', color: 'var(--pop-green)' }}>
                  {row.weeklyPoints ?? '—'} <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>this wk</span>
                </div>
                <div className="font-mono font-black" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
                  {row.cumulativeTotal} <span style={{ fontSize: '9px', fontWeight: 700 }}>total</span>
                </div>
              </div>
            </div>

            <div className="space-y-1" style={{ fontSize: '11px' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold uppercase truncate" style={{ background: 'rgba(0,242,250,0.12)', color: 'var(--pop-blue)' }}>
                  <TeamCrest teamId={row.teamId} teamName={row.team} size={14} />
                  {row.team}
                  {row.isBanker && <span className="ml-0.5" title="Banker — points doubled">★ Banker</span>}
                </span>
                <PtsPill value={row.teamPoints} doubled={row.isBanker} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="uppercase font-bold truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {row.player1Name}
                  {row.player1Goal && <span className="ml-0.5 px-1 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
                  {row.player1Assist && <span className="ml-0.5 px-1 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
                  {row.aon?.onPlayer1 && <span className="ml-0.5 px-1 rounded font-black" style={{ background: aonBg[row.aon.outcome], color: row.aon.outcome === 'success' ? '#0A0A0A' : '#fff' }}>{aonLabel[row.aon.outcome]}</span>}
                </span>
                <PtsPill value={row.player1Points} doubled={row.isBanker} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="uppercase font-bold truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {row.player2Name}
                  {row.player2Goal && <span className="ml-0.5 px-1 rounded font-black" style={{ background: 'var(--pop-green)', color: 'var(--pop-black)' }}>G</span>}
                  {row.player2Assist && <span className="ml-0.5 px-1 rounded font-black" style={{ background: 'rgba(204,250,0,0.25)', color: 'var(--pop-green)' }}>A</span>}
                  {row.aon?.onPlayer2 && <span className="ml-0.5 px-1 rounded font-black" style={{ background: aonBg[row.aon.outcome], color: row.aon.outcome === 'success' ? '#0A0A0A' : '#fff' }}>{aonLabel[row.aon.outcome]}</span>}
                </span>
                <PtsPill value={row.player2Points} doubled={row.isBanker} />
              </div>
              {row.bonusCard && (
                <div className="flex items-center justify-between gap-2">
                  <span className="px-1.5 py-0.5 rounded font-black uppercase truncate" style={{ background: 'rgba(160,0,250,0.2)', color: 'var(--pop-pink)' }}>
                    🎴 {bonusCardName ?? 'Bonus Card'}: {row.bonusCard.playerName}
                  </span>
                  <PtsPill value={row.bonusCard.points} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

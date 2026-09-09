'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import TeamCrest from '../../components/TeamCrest'
import ShareableCard from '../../components/ShareableCard'
import PopArtLoading from '../../components/PopArtLoading'
import { bonusCardDisplayName } from '../lib/players'
import Link from 'next/link'

type WrappedStats = {
  rank: number
  totalEntrants: number
  totalPoints: number
  leagueAvg: number
  gameweeksPlayed: number
  bestGw: { gw: number; points: number } | null
  worstGw: { gw: number; points: number } | null
  bankerCount: number
  bankerValueAdded: number
  aonOutcome: 'succeeded' | 'failed' | 'pending' | 'not played'
  bonusCardName: string | null
  bonusCardOutcome: { played: boolean; points: number | null } | null
  favouriteTeam: { name: string; teamId: number; count: number } | null
  goals: number
  assists: number
  homeWins: number
  awayWins: number
}

function teamDisplayName(team: { name: string; short_name: string | null } | undefined) {
  if (!team) return 'Unknown'
  return team.short_name ?? team.name.replace(' FC', '').replace(' AFC', '')
}

export default function WrappedPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<WrappedStats | null>(null)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { window.location.href = '/login'; return }
    setUser(authUser)

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
    setDisplayName(profile?.display_name ?? '')

    try {
      const { data: comp } = await supabase.from('competitions').select('*').eq('status', 'active').maybeSingle()
      if (!comp) { setCompetition(null); setLoading(false); return }
      setCompetition(comp)

      const [
        { data: entries }, { data: picksRaw }, { data: pointsRaw }, { data: gameweeks },
        { data: teams }, { data: events }, { data: fixtures },
        { data: aonPicksRaw }, { data: bonusCardPlaysRaw }, { data: bonusCardPlayerRow },
      ] = await Promise.all([
        supabase.from('competition_entries').select('user_id').eq('competition_id', comp.id).eq('removed', false),
        supabase.from('picks').select('id, user_id, gameweek_id, team_id, player1_id, player2_id, is_banker').eq('competition_id', comp.id),
        supabase.from('points').select('user_id, pick_id, gameweek_id, total_points, team_points, player1_points, player2_points, breakdown').eq('competition_id', comp.id),
        supabase.from('gameweeks').select('id, number, deadline, status').eq('competition_id', comp.id),
        supabase.from('teams').select('id, name, short_name, short_code'),
        supabase.from('match_events').select('player_id, event_type, fixture_id'),
        supabase.from('fixtures').select('id, gameweek_id'),
        supabase.from('all_or_nothing_picks').select('user_id, gameweek_id, player_id, outcome').eq('competition_id', comp.id),
        supabase.from('bonus_card_plays').select('user_id, gameweek_id, player_id, points').eq('competition_id', comp.id),
        comp.bonus_card_player_id != null
          ? supabase.from('players').select('name').eq('id', comp.bonus_card_player_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      const activeUserIds = new Set((entries ?? []).map(e => e.user_id))
      const tMap: Record<number, { id: number; name: string; short_name: string | null }> = {}
      teams?.forEach(t => { tMap[t.id] = t })

      const gwMap: Record<string, number> = {}
      gameweeks?.forEach(g => { gwMap[g.id] = g.number })

      const points = (pointsRaw ?? []).filter(p => activeUserIds.has(p.user_id))
      const picks = (picksRaw ?? []).filter(p => activeUserIds.has(p.user_id))

      // Any gameweek whose deadline has passed but isn't marked "completed"
      // yet is still being scored live — merge in the same read-only
      // preview the Leaderboard uses, so Wrapped reflects the true current
      // picture during a live gameweek, not a stale pre-kickoff total.
      const now = new Date()
      const previewGameweeks = (gameweeks ?? []).filter(g => new Date(g.deadline) < now && g.status !== 'completed')
      const bonusCardPreviewPoints: Record<string, number> = {}
      await Promise.all(previewGameweeks.map(async gw => {
        try {
          const res = await fetch(`/api/scoring/preview?gameweek_id=${gw.id}`)
          const data = await res.json()
          ;(data.rows ?? []).forEach((row: any) => {
            if (!row.pick_id.startsWith('preview-') && activeUserIds.has(row.user_id)) points.push(row)
          })
          ;(data.bonusCardRows ?? []).forEach((row: any) => { bonusCardPreviewPoints[row.user_id] = row.points })
        } catch {
          // A live-preview hiccup shouldn't take the whole recap down —
          // worst case this gameweek's numbers stay stale until it's
          // marked completed for real.
        }
      }))

      const bonusCardPlays = (bonusCardPlaysRaw ?? []).filter(p => activeUserIds.has(p.user_id))

      // --- Totals per user (for rank + league average) ---
      const totalsByUser: Record<string, { total: number; weekly: Record<number, number> }> = {}
      activeUserIds.forEach(uid => { totalsByUser[uid] = { total: 0, weekly: {} } })
      points.forEach(pt => {
        const t = totalsByUser[pt.user_id]
        if (!t) return
        t.total += pt.total_points ?? 0
        const gwNum = gwMap[pt.gameweek_id]
        if (gwNum) t.weekly[gwNum] = (t.weekly[gwNum] ?? 0) + (pt.total_points ?? 0)
      })
      bonusCardPlays.forEach(play => {
        const t = totalsByUser[play.user_id]
        if (!t) return
        const pts = play.points ?? bonusCardPreviewPoints[play.user_id] ?? null
        if (pts == null) return
        t.total += pts
      })

      const ranked = Object.entries(totalsByUser).sort((a, b) => b[1].total - a[1].total)
      const myRank = ranked.findIndex(([uid]) => uid === authUser.id) + 1
      const totalEntrants = ranked.length
      const leagueAvg = totalEntrants > 0
        ? Math.round((ranked.reduce((sum, [, t]) => sum + t.total, 0) / totalEntrants) * 10) / 10
        : 0

      const myWeekly = Object.entries(totalsByUser[authUser.id]?.weekly ?? {}).map(([gw, pts]) => ({ gw: Number(gw), points: pts }))
      myWeekly.sort((a, b) => a.gw - b.gw)
      const sortedByPts = [...myWeekly].sort((a, b) => b.points - a.points)

      // --- My own picks: banker, favourite team, home/away wins, goals/assists ---
      const myPicks = picks.filter(p => p.user_id === authUser.id)
      const bankerPicks = myPicks.filter(p => p.is_banker)

      let bankerValueAdded = 0
      points.forEach(pt => {
        if (pt.user_id !== authUser.id) return
        if ((pt.breakdown as any)?.is_banker === true) {
          // The doubling adds back exactly the pick's own raw total — so
          // half of what got paid out this gameweek IS the extra banker
          // value, the same reasoning the League Trends "Most Value Added"
          // stat already uses.
          bankerValueAdded += (pt.total_points ?? 0) / 2
        }
      })

      const teamPickCount: Record<number, number> = {}
      myPicks.forEach(p => { teamPickCount[p.team_id] = (teamPickCount[p.team_id] ?? 0) + 1 })
      const topTeamEntry = Object.entries(teamPickCount).sort((a, b) => b[1] - a[1])[0]
      const favouriteTeam = topTeamEntry
        ? { name: teamDisplayName(tMap[Number(topTeamEntry[0])]), teamId: Number(topTeamEntry[0]), count: topTeamEntry[1] }
        : null

      let homeWins = 0, awayWins = 0
      points.forEach(pt => {
        if (pt.user_id !== authUser.id) return
        const resultType = (pt.breakdown as any)?.team_detail?.result_type
        if (resultType === 'home_win') homeWins += 1
        else if (resultType === 'away_win') awayWins += 1
      })

      const fixtureGwMap: Record<number, string> = {}
      fixtures?.forEach(f => { fixtureGwMap[f.id] = f.gameweek_id })
      const myPickByGwPlayer = new Set<string>()
      myPicks.forEach(p => {
        myPickByGwPlayer.add(`${p.gameweek_id}_${p.player1_id}`)
        myPickByGwPlayer.add(`${p.gameweek_id}_${p.player2_id}`)
      })
      let goals = 0, assists = 0
      events?.forEach(e => {
        const gwId = fixtureGwMap[e.fixture_id]
        if (!gwId || !e.player_id) return
        if (!myPickByGwPlayer.has(`${gwId}_${e.player_id}`)) return
        if (e.event_type === 'goal') goals += 1
        if (e.event_type === 'assist') assists += 1
      })

      // --- All or Nothing ---
      const myAon = (aonPicksRaw ?? []).find(a => a.user_id === authUser.id)
      const aonOutcome: WrappedStats['aonOutcome'] = !myAon
        ? 'not played'
        : myAon.outcome === 'success' ? 'succeeded'
        : myAon.outcome === 'failed' ? 'failed'
        : 'pending'

      // --- Bonus Card ---
      const myBonusCardPlay = bonusCardPlays.find(p => p.user_id === authUser.id)
      const bonusCardOutcome = myBonusCardPlay
        ? { played: true, points: myBonusCardPlay.points ?? bonusCardPreviewPoints[authUser.id] ?? null }
        : (comp.bonus_card_enabled ? { played: false, points: null } : null)

      setStats({
        rank: myRank || totalEntrants,
        totalEntrants,
        totalPoints: Math.round(totalsByUser[authUser.id]?.total ?? 0),
        leagueAvg,
        gameweeksPlayed: myWeekly.length,
        bestGw: sortedByPts[0] ?? null,
        worstGw: sortedByPts[sortedByPts.length - 1] ?? null,
        bankerCount: bankerPicks.length,
        bankerValueAdded: Math.round(bankerValueAdded),
        aonOutcome,
        bonusCardName: comp.bonus_card_enabled ? bonusCardDisplayName(comp.bonus_card_name, (bonusCardPlayerRow as any)?.name ?? null) : null,
        bonusCardOutcome,
        favouriteTeam,
        goals,
        assists,
        homeWins,
        awayWins,
      })

      setLoading(false)
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong loading your recap')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Shell active="STATS HUB" theme="pop-art">
        <PopArtLoading />
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="STATS HUB" theme="pop-art">
        <div className="pop-art-theme">
          <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl mb-4 mt-2">Your Season</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No active competition right now.</p>
        </div>
      </Shell>
    )
  }

  const isWrapped = competition.status === 'completed' || competition.status === 'archived'

  return (
    <Shell active="STATS HUB" user={user} displayName={displayName} theme="pop-art">
      <div className="pop-art-theme">
        <Link href="/stats" className="text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1 mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
          ← Back to Stats Hub
        </Link>
        <h1 className="pop-hero pop-hero--pink text-5xl sm:text-6xl mb-1">
          {isWrapped ? 'Season Wrapped' : 'Your Season So Far'}
        </h1>
        <p className="font-bold text-sm mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>{competition.name}</p>

        {error && (
          <div className="pop-panel pop-panel--pink px-4 py-3 mb-5 text-sm">{error}</div>
        )}

        {stats && (
          <ShareableCard filename={`${displayName}-${isWrapped ? 'season-wrapped' : 'season-so-far'}`} className="pop-panel pop-panel--pink p-5" style={{}}>
            <div className="text-center mb-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
              <p className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>{displayName}</p>
              <p className="pop-hero pop-hero--green text-6xl leading-none">{stats.totalPoints}</p>
              <p className="text-[10px] uppercase tracking-widest font-black mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>points · rank {stats.rank} of {stats.totalEntrants}</p>
              <p className="text-xs font-bold mt-2" style={{ color: stats.totalPoints >= stats.leagueAvg ? 'var(--pop-green)' : 'rgba(255,255,255,0.6)' }}>
                {stats.totalPoints >= stats.leagueAvg
                  ? `+${Math.round((stats.totalPoints - stats.leagueAvg) * 10) / 10} above the league average`
                  : `${Math.round((stats.totalPoints - stats.leagueAvg) * 10) / 10} below the league average`}
              </p>
            </div>

            {/* Performance — orange family */}
            <p className="text-[9px] uppercase tracking-widest font-black mb-2" style={{ color: 'var(--pop-orange)' }}>Performance</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="pop-panel pop-panel--orange p-3">
                <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Best Gameweek</p>
                <p className="text-lg font-black" style={{ color: 'var(--pop-green)' }}>{stats.bestGw ? `GW${stats.bestGw.gw} · ${stats.bestGw.points} pts` : '—'}</p>
              </div>
              <div className="pop-panel pop-panel--orange p-3">
                <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Worst Gameweek</p>
                <p className="text-lg font-black" style={{ color: 'rgba(255,255,255,0.85)' }}>{stats.worstGw ? `GW${stats.worstGw.gw} · ${stats.worstGw.points} pts` : '—'}</p>
              </div>
              <div className="pop-panel pop-panel--orange p-3">
                <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Favourite Team</p>
                <p className="text-lg font-black flex items-center gap-1.5" style={{ color: 'var(--pop-orange)' }}>
                  {stats.favouriteTeam ? (
                    <>
                      <TeamCrest teamId={stats.favouriteTeam.teamId} teamName={stats.favouriteTeam.name} size={18} />
                      {stats.favouriteTeam.name} ({stats.favouriteTeam.count}x)
                    </>
                  ) : '—'}
                </p>
              </div>
              <div className="pop-panel pop-panel--orange p-3">
                <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Goals & Assists</p>
                <p className="text-lg font-black" style={{ color: 'var(--pop-orange)' }}>{stats.goals}G · {stats.assists}A</p>
              </div>
              <div className="pop-panel pop-panel--orange p-3 col-span-2">
                <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Home / Away Wins</p>
                <p className="text-lg font-black" style={{ color: 'var(--pop-orange)' }}>{stats.homeWins}H · {stats.awayWins}A</p>
              </div>
            </div>

            {/* Mechanics — each keeps its own established site colour */}
            <p className="text-[9px] uppercase tracking-widest font-black mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>Mechanics</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="pop-panel pop-panel--yellow p-3">
                <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Banker</p>
                <p className="text-lg font-black" style={{ color: 'var(--pop-yellow)' }}>{stats.bankerCount}x used{stats.bankerValueAdded !== 0 ? ` · +${stats.bankerValueAdded} pts` : ''}</p>
              </div>
              <div className="pop-panel pop-panel--green p-3">
                <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>All or Nothing</p>
                <p className="text-lg font-black" style={{
                  color: stats.aonOutcome === 'succeeded' ? 'var(--pop-green)' : stats.aonOutcome === 'failed' ? 'var(--pop-red)' : 'rgba(255,255,255,0.7)'
                }}>
                  {stats.aonOutcome === 'not played' ? 'Not played' : stats.aonOutcome === 'pending' ? 'Pending' : stats.aonOutcome === 'succeeded' ? 'Succeeded' : 'Failed'}
                </p>
              </div>
              {stats.bonusCardOutcome && (
                <div className="pop-panel pop-panel--blue p-3 col-span-2">
                  <p className="text-[10px] uppercase tracking-wider font-black mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{stats.bonusCardName}</p>
                  <p className="text-lg font-black" style={{ color: 'var(--pop-blue)' }}>
                    {stats.bonusCardOutcome.played ? (stats.bonusCardOutcome.points != null ? `${stats.bonusCardOutcome.points} pts` : 'Played') : 'Not played'}
                  </p>
                </div>
              )}
            </div>

            <p className="text-center mt-4" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>
              {stats.gameweeksPlayed} gameweek{stats.gameweeksPlayed === 1 ? '' : 's'} played · {competition.name}
            </p>
          </ShareableCard>
        )}
      </div>
    </Shell>
  )
}

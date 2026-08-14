'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import PopArtLoading from '../../components/PopArtLoading'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import { TrophyIcon } from '../../components/icons'
import AwardsShareCard from '../../components/AwardsShareCard'
import Modal from '../../components/Modal'
import { buildPlayerDisplayNames } from '../lib/players'
import { resolveWinners, type ResolvedAward } from '../lib/awards'
import Link from 'next/link'

type Totals = {
  user_id: string
  display_name: string
  is_bot: boolean
  total_points: number
  banker_points: number
  home_wins: number
  away_wins: number
  goals: number
  assists: number
  weekly_points: number[]
}

type Award = ResolvedAward & { emoji: string; title: string; explainer: string }
type TieModal = { title: string; entries: { name: string; detail: string }[] }

// Live-computed from whatever's currently in the database, same as the
// Final Table archive view — nothing is snapshotted, so a past
// competition's awards just keep reading the same way they did the day
// it finished (nothing left to change), and the current one updates as
// the season goes. Reached with ?comp=<id>, or the active competition by
// default.
function AwardsInner() {
  const searchParams = useSearchParams()
  const compId = searchParams.get('comp')

  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [competition, setCompetition] = useState<any>(null)
  const [awards, setAwards] = useState<Award[]>([])
  const [talisman, setTalisman] = useState<Award | null>(null)
  const [hasEntrants, setHasEntrants] = useState(true)
  const [loading, setLoading] = useState(true)
  const [showShare, setShowShare] = useState(false)
  const [tieModal, setTieModal] = useState<TieModal | null>(null)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [compId])

  async function loadData() {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { window.location.href = '/login'; return }
    setUser(authUser)

    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
    setDisplayName(profile?.display_name ?? '')

    const { data: comp } = compId
      ? await supabase.from('competitions').select('id, name, season, status').eq('id', compId).single()
      : await supabase.from('competitions').select('id, name, season, status').eq('status', 'active').single()

    if (!comp) { setCompetition(null); setLoading(false); return }
    setCompetition(comp)

    const [{ data: entries }, { data: profiles }, { data: pointsData }, { data: picks }, { data: teams }, { data: players }, { data: gameweeks }, { data: fixtures }, { data: events }] = await Promise.all([
      supabase.from('competition_entries').select('user_id').eq('competition_id', comp.id).eq('removed', false),
      supabase.from('profiles').select('id, display_name'),
      supabase.from('points').select('user_id, pick_id, total_points, player1_points, player2_points, breakdown, gameweek_id').eq('competition_id', comp.id),
      supabase.from('picks').select('id, user_id, player1_id, player2_id').eq('competition_id', comp.id),
      supabase.from('teams').select('id, name, short_name, short_code'),
      supabase.from('players').select('id, name, web_name, team_id'),
      supabase.from('gameweeks').select('id, number').eq('competition_id', comp.id),
      supabase.from('fixtures').select('id, gameweek_id'),
      supabase.from('match_events').select('player_id, event_type, fixture_id'),
    ])

    // Its own isolated request, same reasoning as everywhere else this
    // pattern shows up — is_bot is a newer, optional column, and a
    // problem reading it should never take the awards down with it.
    const { data: botFlags } = await supabase.from('profiles').select('id, is_bot')
    const isBotMap: Record<string, boolean> = {}
    botFlags?.forEach(b => { isBotMap[b.id] = b.is_bot ?? false })

    const profileMap: Record<string, string> = {}
    profiles?.forEach(p => { profileMap[p.id] = p.display_name ?? 'Unknown' })

    const gwMap: Record<string, number> = {}
    gameweeks?.forEach(g => { gwMap[g.id] = g.number })

    const fixtureGwMap: Record<number, string> = {}
    fixtures?.forEach(f => { fixtureGwMap[f.id] = f.gameweek_id })

    const goalsByPlayerGw: Record<string, number> = {}
    const assistsByPlayerGw: Record<string, number> = {}
    events?.forEach(e => {
      if (!e.player_id || !e.fixture_id) return
      const gwId = fixtureGwMap[e.fixture_id]
      if (!gwId) return
      const key = `${e.player_id}_${gwId}`
      if (e.event_type === 'goal') goalsByPlayerGw[key] = (goalsByPlayerGw[key] || 0) + 1
      if (e.event_type === 'assist') assistsByPlayerGw[key] = (assistsByPlayerGw[key] || 0) + 1
    })

    const pickById: Record<string, { user_id: string; player1_id: number; player2_id: number }> = {}
    picks?.forEach(p => { pickById[p.id] = p })

    const teamMap: Record<number, { short_code?: string | null; short_name?: string | null; name: string }> = {}
    teams?.forEach(t => { teamMap[t.id] = t })
    const playerDisplayNames = buildPlayerDisplayNames(players ?? [], teamMap)

    const totals: Record<string, Totals> = {}
    entries?.forEach(e => {
      totals[e.user_id] = {
        user_id: e.user_id,
        display_name: profileMap[e.user_id] ?? 'Unknown',
        is_bot: isBotMap[e.user_id] ?? false,
        total_points: 0,
        banker_points: 0,
        home_wins: 0,
        away_wins: 0,
        goals: 0,
        assists: 0,
        weekly_points: [],
      }
    })

    // Talisman looks at every pick made, bots included — it's a stat about
    // the footballer, not a trophy competed for by entrants, so leaving
    // Futzy's picks out would just make the total less accurate, not fairer.
    const playerPointsMap: Record<number, number> = {}

    pointsData?.forEach(p => {
      const breakdown = p.breakdown as any
      const isBanker = breakdown?.is_banker === true
      const rawTotal = isBanker ? (p.total_points ?? 0) / 2 : (p.total_points ?? 0)
      const pick = pickById[p.pick_id]

      if (pick) {
        if (pick.player1_id != null) playerPointsMap[pick.player1_id] = (playerPointsMap[pick.player1_id] ?? 0) + (p.player1_points ?? 0)
        if (pick.player2_id != null) playerPointsMap[pick.player2_id] = (playerPointsMap[pick.player2_id] ?? 0) + (p.player2_points ?? 0)
      }

      const t = totals[p.user_id]
      if (!t) return

      t.total_points += p.total_points ?? 0
      if (isBanker) t.banker_points += rawTotal
      if (breakdown?.team?.includes('home_win')) t.home_wins += 1
      if (breakdown?.team?.includes('away_win')) t.away_wins += 1

      const gwNum = gwMap[p.gameweek_id]
      if (gwNum) t.weekly_points[gwNum] = p.total_points ?? 0

      if (pick) {
        t.goals += (goalsByPlayerGw[`${pick.player1_id}_${p.gameweek_id}`] || 0) + (goalsByPlayerGw[`${pick.player2_id}_${p.gameweek_id}`] || 0)
        t.assists += (assistsByPlayerGw[`${pick.player1_id}_${p.gameweek_id}`] || 0) + (assistsByPlayerGw[`${pick.player2_id}_${p.gameweek_id}`] || 0)
      }
    })

    const humans = Object.values(totals).filter(t => !t.is_bot)
    if (humans.length === 0) {
      setAwards([])
      setTalisman(null)
      setHasEntrants(false)
      setLoading(false)
      return
    }
    setHasEntrants(true)

    function longestStreak(t: Totals, avgByGw: Record<number, number>): number {
      const weeks = Object.keys(avgByGw).map(Number).sort((a, b) => b - a)
      let streak = 0
      for (const gw of weeks) {
        const pts = t.weekly_points[gw]
        const avg = avgByGw[gw]
        if (pts === undefined || avg === undefined) break
        if (pts > avg) streak++
        else break
      }
      return streak
    }

    const gwPointsMap: Record<number, number[]> = {}
    pointsData?.forEach(p => {
      const gwNum = gwMap[p.gameweek_id]
      if (!gwNum) return
      ;(gwPointsMap[gwNum] ??= []).push(p.total_points ?? 0)
    })
    const avgByGw: Record<number, number> = {}
    Object.entries(gwPointsMap).forEach(([gw, vals]) => { avgByGw[Number(gw)] = vals.reduce((a, b) => a + b, 0) / vals.length })

    const hasScoredData = (pointsData?.length ?? 0) > 0

    const champion = resolveWinners(
      hasScoredData ? humans.map(t => ({ name: t.display_name, value: t.total_points })) : [],
      c => `${c.value} pts`
    )

    const goldenBoot = resolveWinners(
      humans.map(t => ({ name: t.display_name, value: t.goals })),
      c => `${c.value} goals`,
      { minQualifying: 1 }
    )

    const goldenAssist = resolveWinners(
      humans.map(t => ({ name: t.display_name, value: t.assists })),
      c => `${c.value} assists`,
      { minQualifying: 1 }
    )

    const ironNerve = resolveWinners(
      humans.map(t => ({ name: t.display_name, value: t.banker_points })),
      c => `${c.value} pts from bankers`,
      { minQualifying: 1 }
    )

    const streakMaster = resolveWinners(
      humans.map(t => ({ name: t.display_name, value: longestStreak(t, avgByGw) })),
      c => `${c.value} weeks above average`,
      { minQualifying: 3 }
    )

    const homeBird = resolveWinners(
      humans.map(t => ({ name: t.display_name, value: t.home_wins })),
      c => `${c.value} home wins picked`,
      { minQualifying: 1 }
    )

    const awayDay = resolveWinners(
      humans.map(t => ({ name: t.display_name, value: t.away_wins })),
      c => `${c.value} away wins picked`,
      { minQualifying: 1 }
    )

    const woodenSpoon = resolveWinners(
      (hasScoredData && humans.length > 1) ? humans.map(t => ({ name: t.display_name, value: t.total_points })) : [],
      c => `${c.value} pts`,
      { direction: 'min' }
    )

    const weeklyCandidates: { name: string; value: number; extra: string }[] = []
    humans.forEach(t => {
      t.weekly_points.forEach((pts, gw) => {
        if (pts !== undefined && gw > 0) weeklyCandidates.push({ name: t.display_name, value: pts, extra: String(gw) })
      })
    })
    const momentOfMagic = resolveWinners(
      weeklyCandidates,
      c => `${c.value} pts (GW${c.extra})`,
      { minQualifying: 1 }
    )

    // Needs enough scored gameweeks to split into two meaningful halves —
    // below that, showing a delta from a single week either side is just
    // noise, not a real trend.
    const scoredGwNumbers = Object.keys(avgByGw).map(Number).sort((a, b) => a - b)
    let secondHalfSurge: ResolvedAward = { winnerDisplay: 'Not decided yet', detail: '', tiedEntries: null }
    if (scoredGwNumbers.length >= 4) {
      const mid = Math.floor(scoredGwNumbers.length / 2)
      const firstHalf = scoredGwNumbers.slice(0, mid)
      const secondHalf = scoredGwNumbers.slice(mid)
      const avgOf = (t: Totals, gws: number[]) => gws.reduce((sum, gw) => sum + (t.weekly_points[gw] ?? 0), 0) / gws.length
      secondHalfSurge = resolveWinners(
        humans.map(t => ({ name: t.display_name, value: Math.round((avgOf(t, secondHalf) - avgOf(t, firstHalf)) * 10) / 10 })),
        c => `+${c.value.toFixed(1)} pts/week`,
        { minQualifying: 0.1 }
      )
    }

    setAwards([
      { emoji: '🏆', title: 'Champion', explainer: 'Most total points across the whole competition.', ...champion },
      { emoji: '⚽', title: 'Golden Boot', explainer: 'Most goals scored by your picked players all season.', ...goldenBoot },
      { emoji: '🎯', title: 'Golden Assist', explainer: 'Most assists from your picked players all season.', ...goldenAssist },
      { emoji: '🛡️', title: 'Iron Nerve', explainer: 'Most points earned specifically from Banker doubles.', ...ironNerve },
      { emoji: '🔥', title: 'Streak Master', explainer: 'Longest run of scoring above the weekly average — needs 3+ weeks to qualify.', ...streakMaster },
      { emoji: '🏠', title: 'Home Bird', explainer: 'Most home wins picked all season.', ...homeBird },
      { emoji: '✈️', title: 'Away Day Special', explainer: 'Most away wins picked all season.', ...awayDay },
      { emoji: '🥄', title: 'Wooden Spoon', explainer: 'Lowest total points — nowhere to hide.', ...woodenSpoon },
      { emoji: '✨', title: 'Moment of Magic', explainer: 'The single best gameweek score anyone posted all season.', ...momentOfMagic },
      { emoji: '📈', title: 'Second Half Surge', explainer: 'Biggest rise in average points, second half of the season vs the first — needs at least 4 scored gameweeks.', ...secondHalfSurge },
    ])

    const talismanCandidates = Object.entries(playerPointsMap).map(([playerId, value]) => ({
      name: playerDisplayNames[Number(playerId)] ?? 'Unknown',
      value,
    }))
    setTalisman({
      emoji: '🌟',
      title: 'Talisman',
      explainer: "The footballer who's brought in the most combined points for everyone who picked him, across the whole competition.",
      ...resolveWinners(talismanCandidates, c => `${c.value} pts combined`, { minQualifying: 1 }),
    })

    setLoading(false)
  }

  if (loading) {
    return (
      <Shell active="LEADERBOARD" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (!competition) {
    return (
      <Shell active="LEADERBOARD" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? (
          <div className="pop-art-theme text-center py-12">
            <p className="pop-headline text-2xl mb-2">No Competition Found</p>
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>There&apos;s no active competition, and no competition was specified.</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">No Competition Found</h1>
            <p className="text-gray-500">There&apos;s no active competition, and no competition was specified.</p>
          </>
        )}
      </Shell>
    )
  }

  // Finalised the same moment the admin ends the competition (the existing
  // status change on the Competitions page) — no separate "finalise
  // awards" step to remember. Provisional the whole time it's active, and
  // every category shows from gameweek 1 — categories nobody's qualified
  // for yet just say "Not decided yet" rather than disappearing.
  const isProvisional = competition.status === 'active'

  return (
    <Shell active="LEADERBOARD" user={user} displayName={displayName} theme={popArt ? 'pop-art' : 'classic'}>
      <div className={popArt ? 'pop-art-theme' : ''}>
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          {popArt ? (
            <h1 className="pop-hero pop-hero--pink text-5xl sm:text-6xl">Awards</h1>
          ) : (
            <h1 className="text-3xl font-bold" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>AWARDS</h1>
          )}
          {hasEntrants && (
            <button onClick={() => setShowShare(true)} className={popArt ? 'pop-button px-3 py-1.5 text-xs' : 'text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded border border-[#D9A441]/50 text-[#D9A441]'}>
              Share
            </button>
          )}
        </div>
        <p className={popArt ? 'font-bold text-sm mb-4' : 'text-sm mb-4'} style={popArt ? { color: 'rgba(255,255,255,0.5)' } : { color: '#D9A44199' }}>
          {competition.name}{!isProvisional ? ' — final' : ''}
        </p>

        {isProvisional && hasEntrants && (
          <div className={popArt ? 'pop-panel p-3 mb-5 flex items-center gap-2.5' : 'bg-yellow-900/20 border border-yellow-500/40 rounded-lg p-3 mb-5 flex items-center gap-2.5'} style={popArt ? { borderColor: 'var(--pop-orange)' } : undefined}>
            <span className="text-xl shrink-0">⏳</span>
            <p className={popArt ? 'text-xs font-bold' : 'text-xs text-yellow-200'} style={popArt ? { color: 'var(--pop-orange)' } : undefined}>
              Provisional — recalculated from where things stand right now. Nothing&apos;s official until the competition ends and the admin finalises it.
            </p>
          </div>
        )}

        {!hasEntrants ? (
          <p className={popArt ? 'text-sm' : 'text-sm text-gray-500'} style={popArt ? { color: 'rgba(255,255,255,0.5)' } : undefined}>
            No one&apos;s entered this competition yet.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {awards.map(a => (
                popArt ? (
                  <div key={a.title} className="pop-panel p-4 flex items-start gap-3" style={{ position: 'relative' }}>
                    {isProvisional && (
                      <span className="pop-badge px-1.5 py-0.5" style={{ position: 'absolute', top: 8, right: 8, fontSize: '8px', background: 'var(--pop-orange)' }}>PROVISIONAL</span>
                    )}
                    <span className="text-3xl shrink-0">{a.emoji}</span>
                    <div className="min-w-0">
                      <p className="pop-headline text-xs mb-0.5" style={{ color: 'var(--pop-pink)' }}>{a.title}</p>
                      <p className="text-[10px] mb-1 leading-snug" style={{ color: 'rgba(255,255,255,0.4)' }}>{a.explainer}</p>
                      {a.tiedEntries ? (
                        <button onClick={() => setTieModal({ title: a.title, entries: a.tiedEntries! })} className="font-black uppercase underline decoration-dotted text-left break-words">
                          {a.winnerDisplay}
                        </button>
                      ) : (
                        <p className="font-black uppercase break-words">{a.winnerDisplay}</p>
                      )}
                      {a.detail && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{a.detail}</p>}
                    </div>
                  </div>
                ) : (
                  <div key={a.title} className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-start gap-3" style={{ position: 'relative' }}>
                    {isProvisional && (
                      <span className="uppercase font-bold" style={{ position: 'absolute', top: 8, right: 8, fontSize: '8px', color: '#D9A441' }}>Provisional</span>
                    )}
                    <span className="text-3xl shrink-0">{a.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#D9A441]">{a.title}</p>
                      <p className="text-[10px] mb-1 leading-snug text-[#F5ECD9]/40">{a.explainer}</p>
                      {a.tiedEntries ? (
                        <button onClick={() => setTieModal({ title: a.title, entries: a.tiedEntries! })} className="font-bold uppercase underline decoration-dotted text-left break-words">
                          {a.winnerDisplay}
                        </button>
                      ) : (
                        <p className="font-bold uppercase break-words">{a.winnerDisplay}</p>
                      )}
                      {a.detail && <p className="text-xs text-[#F5ECD9]/50">{a.detail}</p>}
                    </div>
                  </div>
                )
              ))}
            </div>

            {talisman && (
              popArt ? (
                <div className="pop-panel p-4 flex items-start gap-3 mt-4">
                  <span className="text-3xl shrink-0">{talisman.emoji}</span>
                  <div className="min-w-0">
                    <p className="pop-headline text-xs mb-0.5" style={{ color: 'var(--pop-blue)' }}>{talisman.title}</p>
                    <p className="text-[10px] mb-1 leading-snug" style={{ color: 'rgba(255,255,255,0.4)' }}>{talisman.explainer}</p>
                    {talisman.tiedEntries ? (
                      <button onClick={() => setTieModal({ title: talisman.title, entries: talisman.tiedEntries! })} className="font-black uppercase underline decoration-dotted text-left break-words">
                        {talisman.winnerDisplay}
                      </button>
                    ) : (
                      <p className="font-black uppercase break-words">{talisman.winnerDisplay}</p>
                    )}
                    {talisman.detail && <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{talisman.detail}</p>}
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-start gap-3 mt-4">
                  <span className="text-3xl shrink-0">{talisman.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-[#D9A441]">{talisman.title}</p>
                    <p className="text-[10px] mb-1 leading-snug text-[#F5ECD9]/40">{talisman.explainer}</p>
                    {talisman.tiedEntries ? (
                      <button onClick={() => setTieModal({ title: talisman.title, entries: talisman.tiedEntries! })} className="font-bold uppercase underline decoration-dotted text-left break-words">
                        {talisman.winnerDisplay}
                      </button>
                    ) : (
                      <p className="font-bold uppercase break-words">{talisman.winnerDisplay}</p>
                    )}
                    {talisman.detail && <p className="text-xs text-[#F5ECD9]/50">{talisman.detail}</p>}
                  </div>
                </div>
              )
            )}
          </>
        )}

        {!isProvisional && (
          <Link href="/archive" className={popArt ? 'inline-block mt-6 text-sm font-bold' : 'inline-block mt-6 text-sm text-gray-500'} style={popArt ? { color: 'var(--pop-blue)' } : undefined}>
            ← Back to archive
          </Link>
        )}
      </div>

      {showShare && (
        <AwardsShareCard
          competitionName={competition.name}
          awards={awards.map(a => ({ emoji: a.emoji, title: a.title, winner: a.winnerDisplay, detail: a.detail }))}
          isProvisional={isProvisional}
          onClose={() => setShowShare(false)}
          popArt={popArt}
        />
      )}

      {tieModal && (
        <Modal title={tieModal.title} onClose={() => setTieModal(null)} popArt={popArt}>
          <div className="space-y-2">
            {tieModal.entries.map((e, i) => (
              <div key={i} className="flex justify-between gap-3 text-sm">
                <span className="font-bold">{e.name}</span>
                <span className="shrink-0" style={{ color: popArt ? 'rgba(255,255,255,0.5)' : '#F5ECD9AA' }}>{e.detail}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Shell>
  )
}

export default function AwardsPage() {
  return (
    <Suspense fallback={null}>
      <AwardsInner />
    </Suspense>
  )
}

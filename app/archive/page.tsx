'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import PopArtLoading from '../../components/PopArtLoading'
import { TrophyIcon } from '../../components/icons'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import Link from 'next/link'

type PastCompetition = { id: string; name: string; season: string; start_date: string | null; end_date: string | null; manual_winner: string | null; manual_winner_note: string | null }
type Honour = { season: string; competition_name: string; winner: string; notes: string | null }
type PodiumEntry = { name: string; points: number }
type CurrentCompetition = { id: string; name: string; season: string }

// One consistent two-tone "trophy" identity per competition — orange/
// purple for LMS, lime/blue for IC — rather than cycling through random
// colours per row, which had no actual meaning behind which name got
// which colour.
function TrophyBadge({ name, ic = false }: { name: string; ic?: boolean }) {
  const style = ic
    ? { background: 'rgba(0,242,250,0.12)', border: '1px solid rgba(204,250,0,0.5)', color: 'var(--pop-green)' }
    : { background: 'rgba(160,0,250,0.12)', border: '1px solid rgba(250,97,0,0.5)', color: 'var(--pop-orange)' }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-black" style={style}>
      <TrophyIcon size={12} color={ic ? 'var(--pop-blue)' : 'var(--pop-pink)'} /> {name}
    </span>
  )
}

const MEDAL_EMOJI = ['🥇', '🥈', '🥉']
const MEDAL_COLOUR = ['#FFD700', '#C7C7D1', '#CD7F32']

// Top 3, computed live from real points (never Futzy) — same podium shape
// used for a finished competition and, clearly labelled separately, the
// current one still in progress.
function Podium({ entries }: { entries: PodiumEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>No scored gameweeks yet.</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <span style={{ fontSize: i === 0 ? '22px' : '17px', lineHeight: 1 }}>{MEDAL_EMOJI[i]}</span>
          <span className="font-black truncate flex-1" style={{ fontSize: i === 0 ? '15px' : '13px', color: i === 0 ? MEDAL_COLOUR[0] : 'var(--pop-white)' }}>{e.name}</span>
          <span className="font-black shrink-0" style={{ fontSize: i === 0 ? '15px' : '13px', color: MEDAL_COLOUR[i] }}>{e.points} pts</span>
        </div>
      ))}
      {entries.length > 1 && (
        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)' }}>Won by {entries[0].points - entries[1].points} pts</p>
      )}
    </div>
  )
}

export default function ArchivePage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [pastCompetitions, setPastCompetitions] = useState<PastCompetition[]>([])
  const [honours, setHonours] = useState<Honour[]>([])
  const [topThreeByCompId, setTopThreeByCompId] = useState<Record<string, PodiumEntry[]>>({})
  const [currentCompetition, setCurrentCompetition] = useState<CurrentCompetition | null>(null)
  const [currentTopThree, setCurrentTopThree] = useState<PodiumEntry[]>([])
  const [loading, setLoading] = useState(true)

  const supabase = createClient()
  const { popArt } = usePopArtTheme(user?.id)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { window.location.href = '/login'; return }
    setUser(authUser)

    if (authUser) {
      const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', authUser.id).single()
      setDisplayName(profile?.display_name ?? '')
    }

    const [{ data: pastCompetitionsData }, { data: honoursData }, { data: activeComp }] = await Promise.all([
      supabase
        .from('competitions')
        .select('id, name, season, start_date, end_date, manual_winner, manual_winner_note')
        .in('status', ['completed', 'archived'])
        .eq('hidden', false)
        .order('start_date', { ascending: false }),
      supabase.from('honours').select('season, competition_name, winner, notes').order('sort_order', { ascending: false }),
      supabase.from('competitions').select('id, name, season').eq('status', 'active').maybeSingle(),
    ])

    setPastCompetitions(pastCompetitionsData ?? [])
    setHonours(honoursData ?? [])
    setCurrentCompetition(activeComp ?? null)

    // Podiums (top 3 by total points, Futzy never eligible for a place —
    // same "never crowned" rule as everywhere else he appears) computed
    // live from real points data rather than relying on any manual entry,
    // for every past competition plus the current one (clearly labelled
    // provisional there). Isolated from the rest of loadData — a problem
    // here should never take down the plain past-competitions list above.
    try {
      const compIds = [...(pastCompetitionsData ?? []).map(c => c.id), ...(activeComp ? [activeComp.id] : [])]
      if (compIds.length > 0) {
        const [{ data: entries }, { data: pointsRows }, { data: profiles }, { data: bonusCardPlays }] = await Promise.all([
          supabase.from('competition_entries').select('user_id, competition_id').in('competition_id', compIds).eq('removed', false),
          supabase.from('points').select('user_id, competition_id, total_points').in('competition_id', compIds),
          supabase.from('profiles').select('id, display_name, is_bot'),
          supabase.from('bonus_card_plays').select('user_id, competition_id, gameweek_id, points').in('competition_id', compIds),
        ])

        const nameByUid: Record<string, string> = {}
        const isBotByUid: Record<string, boolean> = {}
        profiles?.forEach(p => { nameByUid[p.id] = p.display_name ?? 'Unknown'; isBotByUid[p.id] = p.is_bot ?? false })

        // Still-live gameweeks in the active competition aren't reflected
        // in `points` yet — merge in the same read-only preview the
        // Leaderboard uses so the current podium isn't stuck pre-kickoff.
        const bonusCardPreview: Record<string, number> = {}
        if (activeComp) {
          const { data: liveGws } = await supabase.from('gameweeks').select('id, status, deadline').eq('competition_id', activeComp.id)
          const now = new Date()
          const previewGws = (liveGws ?? []).filter(g => new Date(g.deadline) < now && g.status !== 'completed')
          await Promise.all(previewGws.map(async gw => {
            try {
              const res = await fetch(`/api/scoring/preview?gameweek_id=${gw.id}`)
              const data = await res.json()
              ;(data.rows ?? []).forEach((row: any) => {
                if (!row.pick_id.startsWith('preview-')) return
                pointsRows?.push({ user_id: row.user_id, competition_id: activeComp.id, total_points: row.total_points ?? 0 })
              })
              ;(data.bonusCardRows ?? []).forEach((row: any) => { bonusCardPreview[`${row.user_id}-${gw.id}`] = row.points })
            } catch {
              // Live preview hiccup — the current podium just stays based
              // on whatever's already resolved, not a hard failure.
            }
          }))
        }

        const totalsByComp: Record<string, Record<string, number>> = {}
        compIds.forEach(id => { totalsByComp[id] = {} })
        entries?.forEach(e => { if (totalsByComp[e.competition_id]) totalsByComp[e.competition_id][e.user_id] = 0 })
        pointsRows?.forEach(p => {
          const t = totalsByComp[p.competition_id]
          if (!t || !(p.user_id in t)) return
          t[p.user_id] += p.total_points ?? 0
        })
        bonusCardPlays?.forEach(play => {
          const t = totalsByComp[play.competition_id]
          if (!t || !(play.user_id in t)) return
          const pts = play.points ?? bonusCardPreview[`${play.user_id}-${play.gameweek_id}`] ?? null
          if (pts == null) return
          t[play.user_id] += pts
        })

        const podiumByComp: Record<string, PodiumEntry[]> = {}
        Object.entries(totalsByComp).forEach(([compId, byUser]) => {
          const ranked = Object.entries(byUser)
            .filter(([uid]) => !isBotByUid[uid])
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([uid, pts]) => ({ name: nameByUid[uid] ?? 'Unknown', points: Math.round(pts) }))
          podiumByComp[compId] = ranked
        })

        setTopThreeByCompId(podiumByComp)
        if (activeComp) setCurrentTopThree(podiumByComp[activeComp.id] ?? [])
      }
    } catch {
      // Podiums are an enhancement on top of the plain list — a failure
      // here should never block the page from showing at all.
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <Shell active="WINNERS" theme={popArt ? 'pop-art' : 'classic'}>
        {popArt ? <PopArtLoading /> : <p className="text-gray-500">Loading...</p>}
      </Shell>
    )
  }

  if (popArt) {
    return (
      <Shell active="WINNERS" user={user} displayName={displayName} theme="pop-art">
        <div className="pop-art-theme">
          <h1 className="pop-hero pop-hero--blue text-5xl sm:text-6xl mb-6 mt-2">Winners</h1>

          <div className="space-y-8">

            {currentCompetition && (
              <section>
                <h2 className="pop-headline text-sm mb-1">This Season — So Far</h2>
                <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>{currentCompetition.name} · not final, still moving every gameweek.</p>
                <div className="pop-panel pop-panel--pulse pop-panel--pink p-4">
                  <Podium entries={currentTopThree} />
                </div>
              </section>
            )}

            <section>
              <h2 className="pop-headline text-sm mb-3">Past Competitions</h2>
              {pastCompetitions.length === 0 ? (
                <div className="pop-panel p-6">
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No history yet — you&apos;re making it right now.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {pastCompetitions.map(comp => (
                    <div key={comp.id} className="pop-panel pop-panel--yellow p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="font-black text-sm">{comp.name}</p>
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{comp.season}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Link href={`/awards?comp=${comp.id}`} className="text-xs font-bold" style={{ color: 'var(--pop-orange)' }}>🏆 Awards</Link>
                          <Link href={`/archive/${comp.id}`} className="text-xs font-bold" style={{ color: 'var(--pop-blue)' }}>Final table →</Link>
                        </div>
                      </div>
                      <Podium entries={topThreeByCompId[comp.id] ?? []} />
                      {comp.manual_winner && (
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                          <TrophyBadge name={comp.manual_winner} />
                          {comp.manual_winner_note && (
                            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{comp.manual_winner_note}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="pop-headline text-sm mb-1">Honours Board</h2>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>Winners from before the website era.</p>
              {honours.length === 0 ? (
                <div className="pop-panel p-6">
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>No historical winners recorded yet.</p>
                </div>
              ) : (
                <div className="pop-panel" style={{ overflow: 'hidden' }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left" style={{ background: 'rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                        <th className="py-2 px-4">Season</th>
                        <th className="py-2 px-4">Competition</th>
                        <th className="py-2 px-4">Winner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {honours.map((h, i) => (
                        <tr key={i} style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.1)' : undefined }}>
                          <td className="py-2 px-4" style={{ color: 'rgba(255,255,255,0.5)' }}>{h.season}</td>
                          <td className="py-2 px-4">{h.competition_name}</td>
                          <td className="py-2 px-4"><TrophyBadge name={h.winner} ic={h.competition_name === 'IC'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
        </div>
      </Shell>
    )
  }

  const cardClass = "bg-white/5 border border-white/10 rounded-lg"

  return (
    <Shell active="WINNERS" user={user} displayName={displayName}>
      <HeroPage wide heroOverride="trophy">
        <div className="w-full text-[#F5ECD9]">
          <h1 className="text-3xl font-bold mb-8" style={{ fontFamily: 'var(--font-heading), serif', color: '#D9A441' }}>Winners</h1>

          <div className="space-y-8">

            <section>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]" style={{ fontFamily: 'var(--font-heading), serif' }}>Past Competitions</h2>
              {pastCompetitions.length === 0 ? (
                <div className={cardClass + ' p-6'}>
                  <p className="text-[#F5ECD9]/50 text-sm">No completed competitions yet. The first one is underway.</p>
                </div>
              ) : (
                <div className={cardClass + ' divide-y divide-white/10'}>
                  {pastCompetitions.map(comp => (
                    <Link
                      key={comp.id}
                      href={`/archive/${comp.id}`}
                      className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
                    >
                      <div>
                        <p className="font-bold text-sm">{comp.name}</p>
                        <p className="text-xs text-[#F5ECD9]/40">{comp.season}</p>
                        {comp.manual_winner && (
                          <p className="text-xs text-[#D9A441] mt-0.5">🏆 {comp.manual_winner}</p>
                        )}
                      </div>
                      <span className="text-sm text-[#F5ECD9]/40">Final table →</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-lg font-bold mb-3 text-[#D9A441]" style={{ fontFamily: 'var(--font-heading), serif' }}>Honours Board</h2>
              <p className="text-xs text-[#F5ECD9]/40 mb-3">Winners from before the website era.</p>
              {honours.length === 0 ? (
                <div className={cardClass + ' p-6'}>
                  <p className="text-[#F5ECD9]/50 text-sm">No historical winners recorded yet.</p>
                </div>
              ) : (
                <div className={cardClass + ' overflow-hidden'}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[#F5ECD9]/50 border-b border-white/10" style={{ backgroundColor: '#241a12' }}>
                        <th className="py-2 px-4">Season</th>
                        <th className="py-2 px-4">Competition</th>
                        <th className="py-2 px-4">Winner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {honours.map((h, i) => (
                        <tr key={i} className="border-b border-white/10 last:border-0">
                          <td className="py-2 px-4 text-[#F5ECD9]/50">{h.season}</td>
                          <td className="py-2 px-4">{h.competition_name}</td>
                          <td className="py-2 px-4 font-bold text-[#D9A441]">🏆 {h.winner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

          </div>
        </div>
      </HeroPage>
    </Shell>
  )
}

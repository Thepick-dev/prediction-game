'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import Shell from '../components/ceefax-shell'
import HeroPage from '../../components/HeroPage'
import PopArtLoading from '../../components/PopArtLoading'
import FitName from '../../components/FitName'
import KitBadge from '../../components/KitBadge'
import { TrophyIcon } from '../../components/icons'
import { usePopArtTheme } from '../lib/usePopArtTheme'
import Link from 'next/link'

type PastCompetition = { id: string; name: string; season: string; start_date: string | null; end_date: string | null; manual_winner: string | null; manual_winner_note: string | null }
type Honour = { season: string; competition_name: string; winner: string; notes: string | null }
type PodiumEntry = { uid: string; name: string; points: number }
type CurrentCompetition = { id: string; name: string; season: string }
type KitInfo = { pattern: string; colour1: string; colour2: string; colour3: string | null; stars: number; earths: number }

// One consistent two-tone "trophy" identity per competition — orange/
// purple for LMS, lime/blue for IC — rather than cycling through random
// colours per row, which had no actual meaning behind which name got
// which colour. A bold glowing name with a trophy icon, not a pill badge
// — matches the Leaderboard's own "big glowing name" identity instead of
// a small boxed-in chip, for names that (unlike a live podium entry)
// have no profile/kit to show.
function TrophyName({ name, ic = false }: { name: string; ic?: boolean }) {
  const color = ic ? 'var(--pop-green)' : 'var(--pop-orange)'
  const glow = ic ? 'rgba(174,224,0,0.5)' : 'rgba(250,97,0,0.5)'
  return (
    <span className="inline-flex items-center gap-1.5 font-black uppercase" style={{ color, textShadow: `0 0 6px ${glow}` }}>
      <TrophyIcon size={16} color={ic ? 'var(--pop-blue)' : 'var(--pop-pink)'} /> {name}
    </span>
  )
}

const MEDAL_COLOUR = ['#FFD700', '#C7C7D1', '#CD7F32']

// Top 3, computed live from real points (never Futzy) — same podium shape
// used for a finished competition and, clearly labelled separately, the
// current one still in progress. A real kit badge + big glowing name per
// entry, the same visual language as a Leaderboard row, rather than a
// medal emoji and plain text — this is the page's own "who's actually
// winning," so it should look like it belongs next to the Leaderboard,
// not like a different, flatter site.
function Podium({ entries, kitByUid }: { entries: PodiumEntry[]; kitByUid: Record<string, KitInfo> }) {
  if (entries.length === 0) {
    return <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>No scored gameweeks yet.</p>
  }
  return (
    <div className="flex flex-col gap-2.5">
      {entries.map((e, i) => {
        const kit = kitByUid[e.uid]
        return (
          <div
            key={i}
            className="flex items-center gap-2.5"
            style={i === 0 ? {
              background: 'linear-gradient(90deg, rgba(255,215,0,0.14), transparent)',
              borderRadius: 10, padding: '6px 8px', margin: '-2px -8px',
            } : undefined}
          >
            <span className="shrink-0 text-center font-black font-mono" style={{ width: 18, fontSize: i === 0 ? '15px' : '12px', color: MEDAL_COLOUR[i] }}>{i + 1}</span>
            {kit && (
              <span className="shrink-0">
                <KitBadge pattern={kit.pattern} colour1={kit.colour1} colour2={kit.colour2} colour3={kit.colour3} size={i === 0 ? 34 : 26} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <FitName
                baseSize={i === 0 ? 17 : 14}
                minSize={11}
                className="pop-name"
                style={{
                  color: i === 0 ? MEDAL_COLOUR[0] : 'var(--pop-white)',
                  textShadow: i === 0 ? '0 0 8px rgba(255,215,0,0.5)' : undefined,
                }}
              >
                {e.name}
              </FitName>
            </span>
            <span className="font-black shrink-0 font-mono" style={{ fontSize: i === 0 ? '16px' : '13px', color: MEDAL_COLOUR[i] }}>{e.points} pts</span>
          </div>
        )
      })}
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
  const [kitByUid, setKitByUid] = useState<Record<string, KitInfo>>({})
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
          // is_ghost included here, not fetched separately — ghosts should
          // never appear on this page at all (unlike Leaderboard/Results,
          // which show them behind a toggle), so the simplest correct
          // place to keep them out is right where every other non-entrant
          // gets filtered.
          supabase.from('competition_entries').select('user_id, competition_id, is_ghost').in('competition_id', compIds).eq('removed', false),
          supabase.from('points').select('user_id, competition_id, total_points').in('competition_id', compIds),
          supabase.from('profiles').select('id, display_name, is_bot'),
          supabase.from('bonus_card_plays').select('user_id, competition_id, gameweek_id, points').in('competition_id', compIds),
        ])

        const nameByUid: Record<string, string> = {}
        const isBotByUid: Record<string, boolean> = {}
        profiles?.forEach(p => { nameByUid[p.id] = p.display_name ?? 'Unknown'; isBotByUid[p.id] = p.is_bot ?? false })
        const ghostEntryKeys = new Set((entries ?? []).filter(e => e.is_ghost).map(e => `${e.competition_id}-${e.user_id}`))

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
            .filter(([uid]) => !isBotByUid[uid] && !ghostEntryKeys.has(`${compId}-${uid}`))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([uid, pts]) => ({ uid, name: nameByUid[uid] ?? 'Unknown', points: Math.round(pts) }))
          podiumByComp[compId] = ranked
        })

        setTopThreeByCompId(podiumByComp)
        if (activeComp) setCurrentTopThree(podiumByComp[activeComp.id] ?? [])
      }
    } catch {
      // Podiums are an enhancement on top of the plain list — a failure
      // here should never block the page from showing at all.
    }

    // Its own isolated request, same reasoning as everywhere else this
    // pattern shows up — kit columns are newer/optional, and a problem
    // reading them should only mean a podium entry renders without its
    // badge, never take the whole page down with it.
    try {
      const { data: kitRows } = await supabase.from('profiles').select('id, kit_pattern, kit_colour_1, kit_colour_2, kit_colour_3, kit_stars, kit_earths')
      const kitMap: Record<string, KitInfo> = {}
      kitRows?.forEach(k => {
        kitMap[k.id] = {
          pattern: k.kit_pattern ?? 'solid',
          colour1: k.kit_colour_1 ?? '#1E4D6B',
          colour2: k.kit_colour_2 ?? '#F5ECD9',
          colour3: k.kit_colour_3 ?? null,
          stars: k.kit_stars ?? 0,
          earths: k.kit_earths ?? 0,
        }
      })
      setKitByUid(kitMap)
    } catch {
      // Degrades gracefully — Podium simply skips the badge for anyone
      // missing from this map.
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <Shell active="WINNERS" theme={popArt ? 'pop-art' : 'classic'} loading={loading}>
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
                  <Podium entries={currentTopThree} kitByUid={kitByUid} />
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
                  {pastCompetitions.map((comp, idx) => (
                    <div key={comp.id} className={`pop-panel p-4 ${idx === 0 ? 'pop-panel--pulse pop-panel--yellow' : 'pop-panel--yellow'}`}>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-sm">{comp.name}</p>
                            {idx === 0 && (
                              <span className="pop-badge pop-badge--orange px-1.5 py-0.5" style={{ fontSize: '9px' }}>Just Finished</span>
                            )}
                          </div>
                          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{comp.season}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Link href={`/awards?comp=${comp.id}`} className="text-xs font-bold" style={{ color: 'var(--pop-orange)' }}>🏆 Awards</Link>
                          <Link href={`/archive/${comp.id}`} className="text-xs font-bold" style={{ color: 'var(--pop-blue)' }}>Full archive →</Link>
                        </div>
                      </div>
                      <Podium entries={topThreeByCompId[comp.id] ?? []} kitByUid={kitByUid} />
                      {comp.manual_winner && (
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                          <TrophyName name={comp.manual_winner} />
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
                // A list of bold rows, not a plain data table — each
                // season/competition is a small label, the winner's name
                // is the actual headline (big, glowing), the same emphasis
                // a podium entry gets rather than one more column in a
                // spreadsheet.
                <div className="pop-panel" style={{ overflow: 'hidden' }}>
                  {honours.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 flex-wrap"
                      style={{
                        padding: '14px 16px',
                        borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined,
                        background: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black font-mono" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>{h.season}</span>
                        <span className="pop-badge px-1.5 py-0.5" style={{ fontSize: '9px' }}>{h.competition_name}</span>
                      </div>
                      <div style={{ fontSize: '16px' }}>
                        <TrophyName name={h.winner} ic={h.competition_name === 'IC'} />
                      </div>
                    </div>
                  ))}
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

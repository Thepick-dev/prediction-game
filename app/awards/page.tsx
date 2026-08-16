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
import { computeCompetitionAwards, type CompetitionAward } from '../lib/awards'
import Link from 'next/link'

type Award = CompetitionAward
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

    const teamMap: Record<number, { short_code?: string | null; short_name?: string | null; name: string }> = {}
    teams?.forEach(t => { teamMap[t.id] = t })
    const playerDisplayNames = buildPlayerDisplayNames(players ?? [], teamMap)

    const { awards: computedAwards, talisman: computedTalisman, hasEntrants: computedHasEntrants } = computeCompetitionAwards({
      entries, profiles, pointsData, picks, gameweeks, fixtures, events, isBotMap, playerDisplayNames,
    })

    if (!computedHasEntrants) {
      setAwards([])
      setTalisman(null)
      setHasEntrants(false)
      setLoading(false)
      return
    }
    setHasEntrants(true)
    setAwards(computedAwards)
    setTalisman(computedTalisman)
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

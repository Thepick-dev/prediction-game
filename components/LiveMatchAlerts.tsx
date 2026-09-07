'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '../app/lib/supabase'

type Toast = { id: string; headline: string; sub?: string }

type FixtureRow = { id: number; gameweek_id: string; home_team_id: number; away_team_id: number; home_score: number | null; away_score: number | null; status: string }
type EventRow = { fixture_id: number; player_id: number | null; event_type: string; team_id: number | null }
type MyPick = { gameweek_id: string; team_id: number; player1_id: number; player2_id: number }
type PreviewRow = { user_id: string; team_points: number | null; player1_points: number | null; player2_points: number | null }

const POLL_MS = 25000
const TOAST_VISIBLE_MS = 6000

// Site-wide "matchday" ambience: quietly polls fixtures/match_events for
// whichever gameweek is currently live and drops a small banner when a
// goal is scored or a match finishes — same live-sync data every other
// live-scoring feature on the site already reads, just surfaced as it
// happens rather than only on the next page load. Never names another
// player's pick (see the "naff" feedback that shaped this) — only ever
// tells the viewer about their OWN points, computed via the same
// /api/scoring/preview endpoint the Leaderboard/Stats pages already use,
// so this never re-implements the scoring formula itself, just diffs it
// across polls.
export default function LiveMatchAlerts() {
  const [toast, setToast] = useState<Toast | null>(null)
  const [visible, setVisible] = useState(false)
  const queueRef = useRef<Toast[]>([])
  const showingRef = useRef(false)
  const supabase = createClient()

  // match_events rows get deleted and re-inserted whole on every re-sync
  // (see syncEvents.ts), so their own ids/timestamps are never stable —
  // counting occurrences per fixture+player+type and diffing the COUNT
  // across polls is what survives a resync without re-firing old goals.
  const eventCounts = useRef<Record<string, number>>({})
  const fixtureStatus = useRef<Record<number, string>>({})
  const myPreview = useRef<Record<string, { team_points: number; player1_points: number; player2_points: number }>>({})
  const initialised = useRef(false)
  const teamNames = useRef<Record<number, string>>({})
  const playerNames = useRef<Record<number, string>>({})

  function enqueue(t: Toast) {
    queueRef.current.push(t)
    advanceQueue()
  }

  function advanceQueue() {
    if (showingRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    showingRef.current = true
    setToast(next)
    setVisible(false)
    requestAnimationFrame(() => setVisible(true))
    setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        showingRef.current = false
        advanceQueue()
      }, 300)
    }, TOAST_VISIBLE_MS)
  }

  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    async function poll(userId: string) {
      const { data: comp } = await supabase.from('competitions').select('id').eq('status', 'active').maybeSingle()
      if (!comp || cancelled) return

      const { data: liveGws } = await supabase.from('gameweeks').select('id, number').eq('competition_id', comp.id).eq('status', 'locked')
      if (!liveGws || liveGws.length === 0 || cancelled) return
      const gwIds = liveGws.map(g => g.id)
      const gwNumById: Record<string, number> = {}
      liveGws.forEach(g => { gwNumById[g.id] = g.number })

      if (Object.keys(teamNames.current).length === 0) {
        const { data: teams } = await supabase.from('teams').select('id, name, short_name')
        teams?.forEach(t => { teamNames.current[t.id] = t.short_name ?? t.name })
      }

      const { data: myPicksRaw } = await supabase
        .from('picks')
        .select('gameweek_id, team_id, player1_id, player2_id')
        .eq('user_id', userId)
        .in('gameweek_id', gwIds)
      const myPickByGw: Record<string, MyPick> = {}
      ;(myPicksRaw ?? []).forEach(p => { myPickByGw[p.gameweek_id] = p as MyPick })

      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('id, gameweek_id, home_team_id, away_team_id, home_score, away_score, status')
        .in('gameweek_id', gwIds)
      const fixtureList = (fixtures ?? []) as FixtureRow[]
      if (cancelled) return

      const fixtureIds = fixtureList.map(f => f.id)
      const { data: events } = fixtureIds.length > 0
        ? await supabase.from('match_events').select('fixture_id, player_id, event_type, team_id').in('fixture_id', fixtureIds)
        : { data: [] as EventRow[] }
      if (cancelled) return

      const eventList = (events ?? []) as EventRow[]
      const newPlayerIds = eventList.map(e => e.player_id).filter((id): id is number => id != null && !(id in playerNames.current))
      if (newPlayerIds.length > 0) {
        const { data: players } = await supabase.from('players').select('id, name, web_name').in('id', Array.from(new Set(newPlayerIds)))
        players?.forEach(p => { playerNames.current[p.id] = p.web_name?.trim() || p.name })
      }

      // Fetch each live gameweek's live scoring preview once, so the
      // "+X pts for you" line is always the same number the rest of the
      // site would show, never a second, hand-rolled formula.
      const previewByGw: Record<string, PreviewRow | undefined> = {}
      await Promise.all(gwIds.map(async gwId => {
        try {
          const res = await fetch(`/api/scoring/preview?gameweek_id=${gwId}`)
          const data = await res.json()
          previewByGw[gwId] = (data.rows ?? []).find((r: any) => r.user_id === userId)
        } catch {
          // A missed preview fetch just means no personalised points line
          // this cycle — the public goal/full-time news still shows.
        }
      }))
      if (cancelled) return

      const fixtureGw: Record<number, string> = {}
      fixtureList.forEach(f => { fixtureGw[f.id] = f.gameweek_id })

      const newToasts: Toast[] = []

      // --- Goals/assists ---
      eventList.forEach(e => {
        if (e.event_type !== 'goal' && e.event_type !== 'assist' && e.event_type !== 'own_goal') return
        const key = `${e.fixture_id}_${e.player_id}_${e.event_type}`
        const prevCount = eventCounts.current[key] ?? 0
        eventCounts.current[key] = prevCount + 1
        if (!initialised.current) return // baseline pass — don't toast pre-existing events
        // Only the newest occurrence in this cycle fires (a genuine double
        // in one 25s window is rare enough not to worry about queuing more
        // than one identical-looking toast for it).
        if (prevCount !== 0) return

        const teamName = e.team_id ? teamNames.current[e.team_id] ?? 'Unknown' : 'Unknown'
        if (e.event_type === 'own_goal') {
          newToasts.push({ id: `${key}-${Date.now()}`, headline: `⚠️ OWN GOAL — ${teamName}` })
          return
        }
        const scorer = e.player_id ? playerNames.current[e.player_id] ?? 'Unknown' : 'Unknown'
        const gwId = fixtureGw[e.fixture_id]
        const myPick = gwId ? myPickByGw[gwId] : undefined
        const isMine = myPick && e.player_id != null && (e.player_id === myPick.player1_id || e.player_id === myPick.player2_id)

        let sub: string | undefined
        if (isMine && gwId) {
          const prevPreview = myPreview.current[gwId]
          const currentPreview = previewByGw[gwId]
          if (prevPreview && currentPreview) {
            const delta = Math.round((currentPreview.player1_points ?? 0) + (currentPreview.player2_points ?? 0)
              - prevPreview.player1_points - prevPreview.player2_points)
            if (delta > 0) sub = `+${delta} pts for you!`
          }
        }
        newToasts.push({
          id: `${key}-${Date.now()}`,
          headline: `⚡ ${e.event_type === 'goal' ? 'GOAL' : 'ASSIST'}! ${scorer} (${teamName})`,
          sub
        })
      })

      // --- Full-time results ---
      fixtureList.forEach(f => {
        const prevStatus = fixtureStatus.current[f.id]
        fixtureStatus.current[f.id] = f.status
        if (!initialised.current) return
        if (f.status !== 'finished' || prevStatus === 'finished') return

        const home = teamNames.current[f.home_team_id] ?? 'Home'
        const away = teamNames.current[f.away_team_id] ?? 'Away'
        const myPick = myPickByGw[f.gameweek_id]
        const isMine = myPick && (myPick.team_id === f.home_team_id || myPick.team_id === f.away_team_id)

        let sub: string | undefined
        if (isMine) {
          const gwId = f.gameweek_id
          const prevPreview = myPreview.current[gwId]
          const currentPreview = previewByGw[gwId]
          if (prevPreview && currentPreview) {
            const delta = Math.round((currentPreview.team_points ?? 0) - prevPreview.team_points)
            if (delta !== 0) sub = `${delta > 0 ? '+' : ''}${delta} pts for your pick!`
          }
        }
        newToasts.push({
          id: `ft-${f.id}-${Date.now()}`,
          headline: `⏱ FULL TIME: ${home} ${f.home_score}-${f.away_score} ${away}`,
          sub
        })
      })

      // Record this cycle's preview numbers as the baseline for the next diff.
      gwIds.forEach(gwId => {
        const p = previewByGw[gwId]
        if (p) {
          myPreview.current[gwId] = {
            team_points: p.team_points ?? 0,
            player1_points: p.player1_points ?? 0,
            player2_points: p.player2_points ?? 0
          }
        }
      })

      initialised.current = true
      newToasts.forEach(enqueue)
    }

    async function start() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      await poll(user.id)
      intervalId = setInterval(() => poll(user.id), POLL_MS)
    }

    start()
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!toast) return null

  return (
    <div
      className="fixed left-1/2 top-2 z-[300] px-4 py-2.5 rounded-xl text-center"
      style={{
        transform: `translateX(-50%) translateY(${visible ? '0' : '-120%'})`,
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
        background: 'var(--pop-surface)',
        border: '2px solid var(--pop-green)',
        boxShadow: '0 0 18px rgba(204,250,0,0.4), 0 4px 18px rgba(0,0,0,0.5)',
        maxWidth: 'min(92vw, 380px)'
      }}
    >
      <p className="font-black text-xs sm:text-sm" style={{ color: 'var(--pop-white)' }}>{toast.headline}</p>
      {toast.sub && (
        <p className="font-black text-xs mt-0.5" style={{ color: 'var(--pop-green)' }}>{toast.sub}</p>
      )}
    </div>
  )
}

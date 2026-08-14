import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { redirect } from 'next/navigation'

const BOT_EMAIL = 'futzy@internal.invalid'
const BOT_DISPLAY_NAME = 'Futzy (AI)'

// Every write below goes through this — Server Actions are reachable as
// their own endpoint, not just "the button on a page only admins can see",
// so the page layout's own admin check isn't a guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

export default async function FutzyPage() {
  const supabase = await createServerSupabaseClient()

  const { data: bot } = await supabase.from('profiles').select('id, display_name').eq('is_bot', true).maybeSingle()

  const { data: logs } = bot
    ? await supabase
        .from('bot_pick_log')
        .select('id, competition_id, gameweek_id, created_at, chosen, candidates')
        .order('created_at', { ascending: false })
        .limit(20)
    : { data: null }

  const gameweekIds = [...new Set((logs ?? []).map(l => l.gameweek_id))]
  const competitionIds = [...new Set((logs ?? []).map(l => l.competition_id))]
  const teamIds = [...new Set((logs ?? []).flatMap(l => [
    l.chosen?.team_id,
    ...(l.candidates?.teams ?? []).map((t: any) => t.team_id),
  ].filter(Boolean)))]
  const playerIds = [...new Set((logs ?? []).flatMap(l => [
    l.chosen?.player1_id, l.chosen?.player2_id,
    l.candidates?.all_or_nothing_player_id, l.candidates?.bonus_card_player_id,
    ...(l.candidates?.players ?? []).map((p: any) => p.player_id),
  ].filter(Boolean)))]

  const [{ data: gameweeks }, { data: competitions }, { data: teams }, { data: players }] = await Promise.all([
    gameweekIds.length ? supabase.from('gameweeks').select('id, number').in('id', gameweekIds) : Promise.resolve({ data: [] }),
    competitionIds.length ? supabase.from('competitions').select('id, name').in('id', competitionIds) : Promise.resolve({ data: [] }),
    teamIds.length ? supabase.from('teams').select('id, name, short_name').in('id', teamIds) : Promise.resolve({ data: [] }),
    playerIds.length ? supabase.from('players').select('id, name, web_name').in('id', playerIds) : Promise.resolve({ data: [] }),
  ])

  const gwNumber: Record<string, number> = {}
  gameweeks?.forEach(g => { gwNumber[g.id] = g.number })
  const compName: Record<string, string> = {}
  competitions?.forEach(c => { compName[c.id] = c.name })
  const teamName: Record<number, string> = {}
  teams?.forEach(t => { teamName[t.id] = t.short_name ?? t.name })
  const playerName: Record<number, string> = {}
  players?.forEach(p => { playerName[p.id] = p.web_name?.trim() || p.name })

  async function createFutzy() {
    'use server'
    const admin = await requireAdminAction()

    // A real auth.users row (no password ever set — he never logs in) so
    // profiles.id's foreign key to auth.users is satisfied, exactly like
    // any real signup. email_confirm: true skips the confirmation email a
    // normal signUp() would otherwise trigger.
    const { data: created, error } = await admin.auth.admin.createUser({
      email: BOT_EMAIL,
      email_confirm: true,
    })

    if (error || !created.user) {
      redirect(`/admin/futzy?error=${encodeURIComponent(error?.message ?? 'Could not create Futzy')}`)
    }

    await admin.from('profiles').upsert(
      { id: created.user.id, display_name: BOT_DISPLAY_NAME, is_bot: true, approved: true },
      { onConflict: 'id' }
    )

    redirect('/admin/futzy')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🤖 Futzy</h1>
      <p className="text-gray-500 text-sm mb-8">
        An automated participant — display name &quot;Futzy (AI)&quot; is the only place this is disclosed, deliberately
        low-key — that submits real picks every gameweek using expected goals/assists and fixture strength,
        including his own Banker, All-or-Nothing and Bonus Card decisions, and his own tier draft picks at the
        start of a competition. He can never be crowned the winner, even if he tops the table. Enable him per
        competition from the <a href="/admin/competitions" className="underline">Competitions page</a>.
      </p>

      {!bot ? (
        <div className="bg-white border rounded-lg p-6 max-w-xl">
          <h2 className="font-bold mb-2">He doesn&apos;t exist yet</h2>
          <p className="text-sm text-gray-600 mb-4">
            This creates his account once, ever — a real (but password-less, login-less) user so he can hold picks
            and appear on the leaderboard like anyone else. You only do this once.
          </p>
          <form action={createFutzy}>
            <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">Create Futzy</button>
          </form>
        </div>
      ) : (
        <>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-8 text-sm text-green-800">
            Futzy exists — display name &quot;{bot.display_name}&quot;. Enable him for a competition from the{' '}
            <a href="/admin/competitions" className="underline">Competitions page</a>.
          </div>

          <div className="bg-white border rounded-lg p-6">
            <h2 className="font-bold mb-1">Recent picks &amp; reasoning</h2>
            <p className="text-xs text-gray-500 mb-4">
              Admin-only — his reasoning is never shown anywhere public, even after the deadline, to keep the
              codebase simple about the site&apos;s pre-deadline pick-hiding rule.
            </p>
            {(!logs || logs.length === 0) ? (
              <p className="text-sm text-gray-400">No picks logged yet — check back after the next cron run once he&apos;s enabled.</p>
            ) : (
              <div className="space-y-4">
                {logs.map(log => (
                  <div key={log.id} className="border-b pb-4 last:border-0 last:pb-0">
                    <p className="text-xs text-gray-500 mb-1">
                      {compName[log.competition_id] ?? 'Unknown competition'} — GW{gwNumber[log.gameweek_id] ?? '?'}
                    </p>
                    <p className="text-sm font-medium mb-2">
                      {teamName[log.chosen?.team_id] ?? '?'} · {playerName[log.chosen?.player1_id] ?? '?'} · {playerName[log.chosen?.player2_id] ?? '?'}
                      {' '}<span className="text-gray-400">(projected {log.chosen?.projected_total ?? '?'} pts)</span>
                    </p>
                    {(log.candidates?.banker || log.candidates?.all_or_nothing_player_id || log.candidates?.bonus_card_player_id) && (
                      <p className="text-xs text-gray-500 mb-2">
                        {log.candidates?.banker && <span className="mr-3">★ Banker played</span>}
                        {log.candidates?.all_or_nothing_player_id && (
                          <span className="mr-3">⚡ AoN on {playerName[log.candidates.all_or_nothing_player_id] ?? log.candidates.all_or_nothing_player_id}</span>
                        )}
                        {log.candidates?.bonus_card_player_id && (
                          <span>🎴 Bonus Card on {playerName[log.candidates.bonus_card_player_id] ?? log.candidates.bonus_card_player_id}</span>
                        )}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                      <div>
                        <p className="font-medium text-gray-600 mb-1">Top teams considered</p>
                        {(log.candidates?.teams ?? []).map((t: any) => (
                          <p key={t.team_id}>{teamName[t.team_id] ?? t.team_id} — {t.projected}</p>
                        ))}
                      </div>
                      <div>
                        <p className="font-medium text-gray-600 mb-1">Top players considered</p>
                        {(log.candidates?.players ?? []).map((p: any) => (
                          <p key={p.player_id}>{playerName[p.player_id] ?? p.player_id} — {p.projected}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

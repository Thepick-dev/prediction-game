import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { redirect } from 'next/navigation'
import ConfirmDeleteButton from '../components/confirm-delete-button'
import ConfirmActionButton from '../components/confirm-action-button'
import BonusCardPlayerPicker from '../components/bonus-card-player-picker'
import BonusCardNomineePicker from '../components/bonus-card-nominee-picker'
import { buildPlayerDisplayNames, bonusCardDisplayName } from '../../lib/players'

// Every write below goes through this — Server Actions are reachable as
// their own endpoint, not just "the button on a page only admins can see",
// so the page layout's own admin check isn't a guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ comp?: string; deleteError?: string }>
}) {
  const { comp: compParam, deleteError } = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: competitions } = await supabase
    .from('competitions')
    .select('*')
    .order('created_at', { ascending: false })

  // Default the entries view to whichever competition is active, or just
  // the most recent one if none is — a fresh visit to this page should
  // show something useful, not an empty picker.
  const selectedCompId = compParam
    ?? competitions?.find(c => c.status === 'active')?.id
    ?? competitions?.[0]?.id
    ?? null

  const [{ data: entries }, { data: profiles }, { data: players }, { data: teams }, { data: bot }] = await Promise.all([
    selectedCompId
      ? supabase
          .from('competition_entries')
          .select('id, user_id, joined_at, removed, removed_at')
          .eq('competition_id', selectedCompId)
          .order('joined_at', { ascending: true })
      : Promise.resolve({ data: null }),
    supabase.from('profiles').select('id, display_name'),
    supabase.from('players').select('id, name, web_name, team_id'),
    supabase.from('teams').select('id, name, short_name, short_code').eq('active', true),
    supabase.from('profiles').select('id').eq('is_bot', true).maybeSingle(),
  ])

  // Its own isolated, defensive fetch — the bonus_card_nominees table is
  // new and optional; a competition using only the single-player picker
  // above should never fail to load this page just because this query
  // (or the table itself, before the SQL's been run) has a problem.
  const { data: bonusCardNomineeRows } = selectedCompId
    ? await supabase.from('bonus_card_nominees').select('id, player_id, display_name, active').eq('competition_id', selectedCompId).order('created_at', { ascending: true })
    : { data: null as { id: string; player_id: number; display_name: string | null; active: boolean }[] | null }

  const nameByUserId: Record<string, string> = {}
  profiles?.forEach(p => { nameByUserId[p.id] = p.display_name ?? 'Unknown' })

  const teamMap: Record<number, { short_code?: string | null; short_name?: string | null; name: string }> = {}
  teams?.forEach(t => { teamMap[t.id] = t })
  const teamNameById: Record<number, string> = {}
  teams?.forEach(t => { teamNameById[t.id] = t.short_name ?? t.name })

  const playerDisplayNames = buildPlayerDisplayNames(players ?? [], teamMap)
  const bonusCardPlayerOptions = (players ?? [])
    .filter(p => teamNameById[p.team_id] != null)
    .map(p => ({ id: p.id, name: p.web_name?.trim() || p.name, team_name: teamNameById[p.team_id] }))
    .sort((a, b) => a.name.localeCompare(b.name))

  async function toggleEntryRemoved(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const entryId = formData.get('entry_id') as string
    const nextRemoved = formData.get('next_removed') === 'true'
    const compId = formData.get('comp_id') as string

    await supabase
      .from('competition_entries')
      .update({ removed: nextRemoved, removed_at: nextRemoved ? new Date().toISOString() : null })
      .eq('id', entryId)

    redirect(`/admin/competitions?comp=${compId}`)
  }

  async function createCompetition(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()

    const baseFields = {
      name: formData.get('name') as string,
      season: formData.get('season') as string,
      status: 'upcoming',
      start_date: formData.get('start_date') as string,
      end_date: formData.get('end_date') as string,
    }

    // Banker/All-or-Nothing/Bonus Card mechanics — set once here, never
    // edited after creation, so nobody's picking under rules that change
    // mid-season. Two-step insert: try with these new columns first, and
    // if that fails because the SQL hasn't been run yet, fall back to a
    // plain insert rather than failing to create the competition at all.
    const mechanicsFields = {
      banker_enabled: formData.get('banker_enabled') === 'on',
      banker_multiplier: Number(formData.get('banker_multiplier')) || 2,
      all_or_nothing_enabled: formData.get('all_or_nothing_enabled') === 'on',
      bonus_card_points_multiplier: Number(formData.get('bonus_card_points_multiplier')) || 1,
      bonus_card_max_plays: Number(formData.get('bonus_card_max_plays')) || 1,
      bonus_card_player_use_cap: Number(formData.get('bonus_card_player_use_cap')) || 1,
    }

    let { data: comp, error } = await supabase
      .from('competitions')
      .insert({ ...baseFields, ...mechanicsFields })
      .select()
      .single()

    if (error) {
      const fallback = await supabase.from('competitions').insert(baseFields).select().single()
      comp = fallback.data
      error = fallback.error
    }

    if (!error && comp) {
      await supabase.rpc('insert_default_scoring_rules', { comp_id: comp.id })
      await supabase.rpc('insert_default_player_scoring_rules', { comp_id: comp.id })
    }

    redirect('/admin/competitions')
  }

  async function archiveCompetition(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string
    await supabase
      .from('competitions')
      .update({ status: 'archived' })
      .eq('id', id)
    redirect('/admin/competitions')
  }

  // The intended "season's officially over" moment the Awards page and the
  // public Archive listing already assume — Awards' isProvisional check
  // (competition.status === 'active') and Archive's own query
  // (.in('status', ['completed', 'archived'])) were both already written
  // expecting this, but nothing ever actually set it until now.
  async function finalizeCompetition(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string
    await supabase
      .from('competitions')
      .update({ status: 'completed' })
      .eq('id', id)
    redirect('/admin/competitions')
  }

  async function activateCompetition(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string

    await supabase
      .from('competitions')
      .update({ status: 'archived' })
      .eq('status', 'active')

    await supabase
      .from('competitions')
      .update({ status: 'active' })
      .eq('id', id)

    redirect('/admin/competitions')
  }

  async function deleteCompetition(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string

    // Deletes everything that references this competition first — the
    // database blocks deleting a competition that still has gameweeks,
    // picks, entries, or tier data pointing at it. Same reasoning and
    // shape as deleteGameweek on the Gameweeks page, just one level up.
    const [{ data: gameweeks }, { data: compPicks }] = await Promise.all([
      supabase.from('gameweeks').select('id').eq('competition_id', id),
      supabase.from('picks').select('id').eq('competition_id', id),
    ])
    const gameweekIds = (gameweeks ?? []).map(g => g.id)
    const pickIds = (compPicks ?? []).map(p => p.id)

    if (pickIds.length > 0) {
      await supabase.from('wall_replies').delete().in('pick_id', pickIds)
    }
    if (gameweekIds.length > 0) {
      await supabase.from('gameweek_quartiles').delete().in('gameweek_id', gameweekIds)
      await supabase.from('gameweek_questions').delete().in('gameweek_id', gameweekIds)
      await supabase.from('gameweek_snapshots').delete().in('gameweek_id', gameweekIds)
      await supabase.from('fixtures').delete().in('gameweek_id', gameweekIds)
    }

    await supabase.from('points').delete().eq('competition_id', id)
    await supabase.from('all_or_nothing_picks').delete().eq('competition_id', id)
    await supabase.from('bonus_card_plays').delete().eq('competition_id', id)
    await supabase.from('picks').delete().eq('competition_id', id)
    await supabase.from('competition_entries').delete().eq('competition_id', id)
    await supabase.from('tier_draft_picks').delete().eq('competition_id', id)
    await supabase.from('draft_tier_assignments').delete().eq('competition_id', id)
    await supabase.from('tier_assignments').delete().eq('competition_id', id)
    await supabase.from('competition_draft_tiers').delete().eq('competition_id', id)
    await supabase.from('competition_scoring_rules').delete().eq('competition_id', id)
    await supabase.from('player_scoring_rules').delete().eq('competition_id', id)
    await supabase.from('competition_snapshots').delete().eq('competition_id', id)
    await supabase.from('bot_pick_log').delete().eq('competition_id', id)
    await supabase.from('gameweeks').delete().eq('competition_id', id)

    const { error } = await supabase.from('competitions').delete().eq('id', id)
    if (error) {
      redirect(`/admin/competitions?deleteError=${encodeURIComponent(error.message)}`)
    }
    redirect('/admin/competitions')
  }

  async function toggleBonusCard(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string
    const current = formData.get('current') === 'true'
    await supabase
      .from('competitions')
      .update({ bonus_card_enabled: !current })
      .eq('id', id)
    redirect(`/admin/competitions?comp=${id}#bonus-card`)
  }

  async function toggleBotEnabled(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string
    const current = formData.get('current') === 'true'
    const nextEnabled = !current
    await supabase
      .from('competitions')
      .update({ bot_enabled: nextEnabled })
      .eq('id', id)

    // Give Futzy a real competition_entries row the moment he's switched on,
    // same as how a real player gets one the moment they join — the cron
    // path also does this defensively, but doing it here means he shows up
    // on the leaderboard immediately rather than only after tomorrow's run.
    // Uses the admin client specifically: competition_entries' own RLS
    // (mirroring how a real player joins) only lets a session insert a row
    // for ITSELF, so the admin's own session inserting a row for Futzy's
    // user_id was being silently rejected — this bypasses that correctly,
    // since this is a trusted admin action creating bot infrastructure,
    // not a user self-service one.
    if (nextEnabled) {
      const { data: bot } = await supabase.from('profiles').select('id').eq('is_bot', true).single()
      if (bot) {
        const { data: existingEntry } = await supabase
          .from('competition_entries')
          .select('user_id')
          .eq('competition_id', id)
          .eq('user_id', bot.id)
          .maybeSingle()
        if (!existingEntry) {
          await supabase.from('competition_entries').insert({ user_id: bot.id, competition_id: id })
        }
      }
    }

    redirect(`/admin/competitions?comp=${id}#futzy`)
  }

  async function setBonusCardPlayer(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const competitionId = formData.get('competition_id') as string
    const playerId = Number(formData.get('player_id'))
    await supabase
      .from('competitions')
      .update({ bonus_card_player_id: playerId })
      .eq('id', competitionId)
    redirect(`/admin/competitions?comp=${competitionId}#bonus-card`)
  }

  // Purely cosmetic — unlike renominating the player, renaming never
  // affects scoring or history, so this saves directly with no confirm step.
  async function setBonusCardName(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const competitionId = formData.get('competition_id') as string
    const name = (formData.get('name') as string)?.trim() || null
    await supabase
      .from('competitions')
      .update({ bonus_card_name: name })
      .eq('id', competitionId)
    redirect(`/admin/competitions?comp=${competitionId}#bonus-card`)
  }

  // Optional pool of SEVERAL simultaneous Bonus Card nominees — additive to
  // the single-player picker above, which keeps working untouched. If this
  // pool has any active rows for a competition, it takes over from the
  // single `bonus_card_player_id` automatically (see getBonusCardNominees);
  // an empty pool means "use the single nominee above", exactly like every
  // competition before this feature existed.
  async function addBonusCardNominee(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const competitionId = formData.get('competition_id') as string
    const playerId = Number(formData.get('player_id'))
    await supabase
      .from('bonus_card_nominees')
      .upsert({ competition_id: competitionId, player_id: playerId, active: true }, { onConflict: 'competition_id,player_id' })
    redirect(`/admin/competitions?comp=${competitionId}#bonus-card`)
  }

  async function toggleBonusCardNominee(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const competitionId = formData.get('competition_id') as string
    const nomineeId = formData.get('nominee_id') as string
    const current = formData.get('current') === 'true'
    await supabase.from('bonus_card_nominees').update({ active: !current }).eq('id', nomineeId)
    redirect(`/admin/competitions?comp=${competitionId}#bonus-card`)
  }


  // Cosmetic pause, not a functional one — deadlines/autopick/scoring keep
  // running exactly as normal underneath (an explicit choice, see proxy.ts).
  // This just decides what a non-admin sees when they load any page: the
  // real site, or a "Game Cancelled" message. Nothing is deleted or reset
  // either way, and toggling back on is instant.
  async function togglePause(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const id = formData.get('id') as string
    const current = formData.get('current') === 'true'
    await supabase.from('competitions').update({ paused: !current }).eq('id', id)
    redirect(`/admin/competitions?comp=${id}#pause`)
  }

  async function setPauseMessage(formData: FormData) {
    'use server'
    const supabase = await requireAdminAction()
    const competitionId = formData.get('competition_id') as string
    const message = (formData.get('message') as string)?.trim() || null
    await supabase.from('competitions').update({ paused_message: message }).eq('id', competitionId)
    redirect(`/admin/competitions?comp=${competitionId}#pause`)
  }

  const hasActiveCompetition = competitions?.some(c => c.status === 'active') ?? false

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Competitions</h1>

      {deleteError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">
          Couldn&apos;t delete that competition: {deleteError}
        </div>
      )}

      {(() => {
        const activeComp = competitions?.find(c => c.status === 'active')
        if (!activeComp) return null
        return (
          <div id="pause" className={`border rounded-lg p-6 mb-8 ${activeComp.paused ? 'bg-red-50 border-red-300' : 'bg-white'}`}>
            <h2 className="font-bold mb-1">{activeComp.paused ? '🚫 Game is Cancelled' : 'Pause Game'}</h2>
            <p className="text-xs text-gray-500 mb-4">
              Instantly shows &quot;Game Cancelled&quot; to every player on every page — useful if you need to freeze
              things while sorting out a dispute or a problem. Nothing is deleted: picks, scores and history are
              untouched, and deadlines keep passing normally in the background while paused. You (admin) always see
              the real site. Reactivate any time.
            </p>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-xs text-gray-500">Status:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${activeComp.paused ? 'bg-red-600 text-white' : 'bg-green-100 text-green-700'}`}>
                {activeComp.paused ? 'CANCELLED' : 'Live'}
              </span>
              <ConfirmActionButton
                action={togglePause}
                hiddenFields={{ id: activeComp.id, current: String(activeComp.paused ?? false) }}
                label={activeComp.paused ? 'Reactivate Game' : 'Cancel Game'}
                confirmText={activeComp.paused ? 'Bring the game back for everyone?' : 'Show "Game Cancelled" to every player right now?'}
                confirmLabel={activeComp.paused ? 'Yes, reactivate' : 'Yes, cancel it'}
                className={`text-xs rounded px-3 py-1.5 ${activeComp.paused ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Message shown to players <span className="text-gray-400">(optional — leave blank for a generic message)</span>
              </label>
              <form action={setPauseMessage} className="flex items-center gap-2 flex-wrap">
                <input type="hidden" name="competition_id" value={activeComp.id} />
                <input
                  name="message"
                  defaultValue={activeComp.paused_message ?? ''}
                  placeholder="e.g. Paused while we sort something out — back soon"
                  className="border rounded px-2 py-1 text-xs w-80"
                />
                <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save message</button>
              </form>
            </div>
          </div>
        )
      })()}

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Create New Competition</h2>
        <form action={createCompetition} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              name="name"
              placeholder="e.g. 2026/27 First Half"
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Season</label>
            <input
              name="season"
              placeholder="e.g. 2026-27"
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              name="start_date"
              type="date"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              name="end_date"
              type="date"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div className="col-span-2 border-t pt-4 mt-2">
            <p className="text-sm font-bold mb-1">Banker, All-or-Nothing &amp; Bonus Card</p>
            <p className="text-xs text-gray-500 mb-3">
              These are set once here and can&apos;t be changed after the competition is created —
              so nobody ends up picking under rules that shifted mid-season.
            </p>
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-4">
            <div className="border rounded p-3">
              <label className="flex items-center gap-2 text-sm font-medium mb-2">
                <input type="checkbox" name="banker_enabled" defaultChecked />
                Banker enabled
              </label>
              <label className="block text-xs text-gray-500 mb-1">Points multiplier when Banker is used</label>
              <input
                name="banker_multiplier"
                type="number"
                step="0.5"
                min="1"
                defaultValue={2}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>

            <div className="border rounded p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="all_or_nothing_enabled" defaultChecked />
                All-or-Nothing enabled
              </label>
            </div>

            <div className="border rounded p-3 col-span-2">
              <p className="text-sm font-medium mb-2">Bonus Card</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Points multiplier</label>
                  <input
                    name="bonus_card_points_multiplier"
                    type="number"
                    step="0.5"
                    min="0.5"
                    defaultValue={1}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Plays allowed per user</label>
                  <input
                    name="bonus_card_max_plays"
                    type="number"
                    min="1"
                    defaultValue={1}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Max plays on the same player</label>
                  <input
                    name="bonus_card_player_use_cap"
                    type="number"
                    min="1"
                    defaultValue={1}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Whether the Bonus Card is on at all, and who it&apos;s nominated for, are set below
                once the competition exists (and can be changed any time).
              </p>
            </div>
          </div>

          <div className="col-span-2">
            <button
              type="submit"
              className="bg-black text-white rounded px-4 py-2 text-sm"
            >
              Create Competition
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">All Competitions</h2>
        {hasActiveCompetition && (
          <p className="text-xs text-gray-500 mb-4">
            Only one competition can be active at a time. Activating a different one will automatically archive the current active competition.
          </p>
        )}
        {competitions && competitions.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Name</th>
                <th className="pb-2">Season</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Start</th>
                <th className="pb-2">End</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {competitions.map((comp) => (
                <tr key={comp.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{comp.name}</td>
                  <td className="py-2">{comp.season}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      comp.status === 'active' ? 'bg-green-100 text-green-700' :
                      comp.status === 'archived' ? 'bg-gray-100 text-gray-700' :
                      comp.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {comp.status}
                    </span>
                  </td>
                  <td className="py-2">{comp.start_date ?? '—'}</td>
                  <td className="py-2">{comp.end_date ?? '—'}</td>
                  <td className="py-2">
                    <div className="flex gap-2 flex-wrap items-center">
                      <a
                        href={`/admin/competitions?comp=${comp.id}#entries`}
                        className={`text-xs rounded px-2 py-1 ${selectedCompId === comp.id ? 'bg-black text-white' : 'border'}`}
                      >
                        Entries
                      </a>
                      {comp.status !== 'active' && (
                        <form action={activateCompetition}>
                          <input type="hidden" name="id" value={comp.id} />
                          <button type="submit" className="text-xs bg-green-600 text-white rounded px-2 py-1">
                            {comp.status === 'archived' ? 'Reactivate' : 'Activate'}
                          </button>
                        </form>
                      )}
                      {comp.status === 'active' && (
                        <ConfirmActionButton
                          action={finalizeCompetition}
                          hiddenFields={{ id: comp.id }}
                          label="Finalize"
                          confirmText="Mark this competition as finished? Awards and personal season summaries switch from provisional to final. Make sure every gameweek is scored first."
                          confirmLabel="Yes, finalize it"
                          className="text-xs bg-blue-600 text-white rounded px-2 py-1"
                        />
                      )}
                      {comp.status !== 'archived' && (
                        <form action={archiveCompetition}>
                          <input type="hidden" name="id" value={comp.id} />
                          <button type="submit" className="text-xs bg-gray-600 text-white rounded px-2 py-1">
                            Archive
                          </button>
                        </form>
                      )}
                      <ConfirmDeleteButton
                        action={deleteCompetition}
                        hiddenFields={{ id: comp.id }}
                        confirmText={`Delete "${comp.name}" permanently?`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-500 text-sm">No competitions yet.</p>
        )}
      </div>

      {selectedCompId && (
        <div id="entries" className="bg-white border rounded-lg p-6 mt-8">
          <h2 className="font-bold mb-1">
            Entries — {competitions?.find(c => c.id === selectedCompId)?.name ?? 'Competition'}
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Removing someone here only takes them out of this one competition — their account, login,
            and any other competition they&apos;re in are untouched. They can&apos;t submit new picks
            for this competition while removed, and they drop off its leaderboard. Re-add at any time.
          </p>
          {entries && entries.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Player</th>
                  <th className="pb-2">Joined</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(entry => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{nameByUserId[entry.user_id] ?? 'Unknown'}</td>
                    <td className="py-2 text-gray-500">
                      {new Date(entry.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${entry.removed ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {entry.removed ? 'Removed' : 'Active'}
                      </span>
                    </td>
                    <td className="py-2">
                      <form action={toggleEntryRemoved}>
                        <input type="hidden" name="entry_id" value={entry.id} />
                        <input type="hidden" name="comp_id" value={selectedCompId} />
                        <input type="hidden" name="next_removed" value={(!entry.removed).toString()} />
                        <button
                          type="submit"
                          className={`text-xs rounded px-2 py-1 ${entry.removed ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
                        >
                          {entry.removed ? 'Re-add' : 'Remove'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-sm">No one has entered this competition yet.</p>
          )}
        </div>
      )}

      {selectedCompId && (() => {
        const selectedComp = competitions?.find(c => c.id === selectedCompId)
        const currentPlayerName = selectedComp?.bonus_card_player_id != null
          ? (playerDisplayNames[selectedComp.bonus_card_player_id] ?? null)
          : null
        const resolvedName = bonusCardDisplayName(selectedComp?.bonus_card_name, currentPlayerName)
        return (
          <>
          <div id="bonus-card" className="bg-white border rounded-lg p-6 mt-8">
            <h2 className="font-bold mb-1">Bonus Card — &quot;{resolvedName}&quot;</h2>
            <p className="text-xs text-gray-500 mb-4">
              One nominated player every entrant can use once, on any gameweek of their choosing, for a bonus score
              on top of their normal picks. See{' '}
              <a href="/admin/help/bonus-card" className="underline">the Bonus Card guide</a> for how this works day to day.
            </p>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-gray-500">Status:</span>
              <span className={`px-2 py-0.5 rounded text-xs ${selectedComp?.bonus_card_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                {selectedComp?.bonus_card_enabled ? 'Enabled' : 'Disabled'}
              </span>
              <form action={toggleBonusCard}>
                <input type="hidden" name="id" value={selectedCompId} />
                <input type="hidden" name="current" value={String(selectedComp?.bonus_card_enabled ?? false)} />
                <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
                  {selectedComp?.bonus_card_enabled ? 'Disable' : 'Enable'}
                </button>
              </form>
              <span className="text-xs text-gray-400">Disabling only blocks new plays — nothing already played is affected.</span>
            </div>
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">
                Display name <span className="text-gray-400">(optional — leave blank to just use &quot;The {'{Player}'} Card&quot;)</span>
              </label>
              <form action={setBonusCardName} className="flex items-center gap-2">
                <input type="hidden" name="competition_id" value={selectedCompId} />
                <input
                  name="name"
                  defaultValue={selectedComp?.bonus_card_name ?? ''}
                  placeholder={currentPlayerName ? `The ${currentPlayerName} Card` : 'The Bonus Card'}
                  className="border rounded px-2 py-1 text-xs w-64"
                />
                <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save name</button>
              </form>
            </div>
            <BonusCardPlayerPicker
              action={setBonusCardPlayer}
              competitionId={selectedCompId}
              players={bonusCardPlayerOptions}
              currentPlayerName={currentPlayerName}
            />

            <div className="mt-6 pt-4 border-t">
              <p className="text-sm font-medium mb-1">Nominate several players at once (optional)</p>
              <p className="text-xs text-gray-500 mb-3">
                Leave this empty to keep using the single player above. Add two or more players here and every
                entrant instead chooses which one to play their card on. Removing a player here only stops it
                being offered for new plays — anyone who already played it keeps their result.
              </p>
              {(bonusCardNomineeRows ?? []).length > 0 && (
                <ul className="mb-3 space-y-1.5">
                  {(bonusCardNomineeRows ?? []).map(n => (
                    <li key={n.id} className="flex items-center gap-2 text-sm">
                      <span className={n.active ? '' : 'text-gray-400 line-through'}>
                        {n.display_name?.trim() || playerDisplayNames[n.player_id] || `Player #${n.player_id}`}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${n.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {n.active ? 'Active' : 'Inactive'}
                      </span>
                      <form action={toggleBonusCardNominee}>
                        <input type="hidden" name="competition_id" value={selectedCompId} />
                        <input type="hidden" name="nominee_id" value={n.id} />
                        <input type="hidden" name="current" value={String(n.active)} />
                        <button type="submit" className="text-xs underline text-gray-500">
                          {n.active ? 'Remove' : 'Re-add'}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              <BonusCardNomineePicker
                action={addBonusCardNominee}
                competitionId={selectedCompId}
                players={bonusCardPlayerOptions}
              />
            </div>
          </div>
          <div id="futzy" className="bg-white border rounded-lg p-6 mt-8">
            <h2 className="font-bold mb-1">🤖 Futzy</h2>
            <p className="text-xs text-gray-500 mb-4">
              An automated participant that submits its own real picks every gameweek, using expected goals/assists
              and fixture strength. Visible on the leaderboard as &quot;Futzy (AI)&quot;, but never eligible to be
              crowned the winner. See <a href="/admin/help/futzy" className="underline">the Futzy guide</a> for setup and how he thinks.
            </p>
            {!bot ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                Futzy doesn&apos;t exist yet — <a href="/admin/futzy" className="underline">create him first</a> before enabling
                him for a competition.
              </p>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Status:</span>
                <span className={`px-2 py-0.5 rounded text-xs ${selectedComp?.bot_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                  {selectedComp?.bot_enabled ? 'Enabled' : 'Disabled'}
                </span>
                <form action={toggleBotEnabled}>
                  <input type="hidden" name="id" value={selectedCompId} />
                  <input type="hidden" name="current" value={String(selectedComp?.bot_enabled ?? false)} />
                  <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
                    {selectedComp?.bot_enabled ? 'Disable' : 'Enable'}
                  </button>
                </form>
                <span className="text-xs text-gray-400">Disabling stops new picks — his history/points stand either way.</span>
              </div>
            )}
          </div>
          </>
        )
      })()}
    </div>
  )
}
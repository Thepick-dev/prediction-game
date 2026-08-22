import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { redirect } from 'next/navigation'
import IssueCardForm from '../components/issue-card-form'

// Every write below goes through this — Server Actions are reachable as
// their own endpoint, not just "the button on a page only admins can see",
// so the page layout's own admin check isn't a guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

async function issueCard(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()

  const competitionId = formData.get('competition_id') as string
  const userId = formData.get('user_id') as string
  const cardType = formData.get('card_type') as 'yellow' | 'red'
  const reason = (formData.get('reason') as string)?.trim()
  const issuedGameweekId = formData.get('issued_gameweek_id') as string

  if (!competitionId || !userId || !reason) {
    redirect('/admin/discipline?error=' + encodeURIComponent('Player and reason are required'))
  }

  const { data: card, error: cardError } = await supabase
    .from('discipline_cards')
    .insert({
      competition_id: competitionId,
      user_id: userId,
      card_type: cardType,
      reason,
      issued_gameweek_id: issuedGameweekId || null,
      status: 'active',
    })
    .select('id')
    .single()

  if (cardError || !card) {
    redirect('/admin/discipline?error=' + encodeURIComponent(cardError?.message ?? 'Could not save the card'))
  }

  // Re-derived server-side, never trusted from the form — a red always
  // triggers; a yellow only triggers if there's already one other
  // unresolved (active, not yet linked to a suspension) yellow this
  // competition, in which case this new one is the 2nd.
  let otherUnresolvedYellowId: string | null = null
  let triggers = cardType === 'red'
  if (cardType === 'yellow') {
    const { data: existingYellow } = await supabase
      .from('discipline_cards')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('user_id', userId)
      .eq('card_type', 'yellow')
      .eq('status', 'active')
      .is('resolved_suspension_id', null)
      .neq('id', card.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (existingYellow) {
      triggers = true
      otherUnresolvedYellowId = existingYellow.id
    }
  }

  if (triggers) {
    const startGameweekId = formData.get('suspension_start_gameweek_id') as string
    const gameweeksCount = Math.max(1, parseInt(formData.get('suspension_gameweeks_count') as string) || 1)
    const suspensionReason = (formData.get('suspension_reason') as string)?.trim() || reason

    // Escalation counts suspensions that actually stand — an overturned one
    // (rescinded on appeal) doesn't count against a player, but a reduced
    // one still does, since it still happened.
    const { count: priorCount } = await supabase
      .from('suspensions')
      .select('id', { count: 'exact', head: true })
      .eq('competition_id', competitionId)
      .eq('user_id', userId)
      .in('status', ['active', 'appealed_reduced'])
    const suspensionNumber = (priorCount ?? 0) + 1

    const { data: allGameweeks } = await supabase
      .from('gameweeks')
      .select('id, number, status')
      .eq('competition_id', competitionId)
      .in('status', ['upcoming', 'open'])
      .order('number', { ascending: true })

    const startIndex = (allGameweeks ?? []).findIndex(g => g.id === startGameweekId)
    const targetGameweeks = startIndex >= 0
      ? (allGameweeks ?? []).slice(startIndex, startIndex + gameweeksCount)
      : []

    if (targetGameweeks.length > 0) {
      const { data: suspension, error: suspensionError } = await supabase
        .from('suspensions')
        .insert({
          competition_id: competitionId,
          user_id: userId,
          suspension_number: suspensionNumber,
          gameweeks_count: targetGameweeks.length,
          trigger_card_id: card.id,
          reason: suspensionReason,
          status: 'active',
        })
        .select('id')
        .single()

      if (!suspensionError && suspension) {
        await supabase.from('suspension_gameweeks').insert(
          targetGameweeks.map(gw => ({ suspension_id: suspension.id, gameweek_id: gw.id }))
        )
        const linkedCardIds = otherUnresolvedYellowId ? [card.id, otherUnresolvedYellowId] : [card.id]
        await supabase.from('discipline_cards').update({ resolved_suspension_id: suspension.id }).in('id', linkedCardIds)
      }
    }
  }

  redirect('/admin/discipline')
}

async function toggleCardStatus(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const cardId = formData.get('card_id') as string
  const nextStatus = formData.get('next_status') as 'active' | 'rescinded'

  const { data: card } = await supabase
    .from('discipline_cards')
    .select('id, resolved_suspension_id')
    .eq('id', cardId)
    .single()

  await supabase.from('discipline_cards').update({ status: nextStatus }).eq('id', cardId)

  // Rescinding a card that triggered/contributed to a suspension overturns
  // that suspension entirely (freeing the gameweeks immediately) — and if
  // it was one of a pair of yellows, un-pairs the other one too, since the
  // "two yellows" condition that created the suspension no longer holds.
  if (nextStatus === 'rescinded' && card?.resolved_suspension_id) {
    await supabase
      .from('suspensions')
      .update({ status: 'appealed_overturned' })
      .eq('id', card.resolved_suspension_id)
    await supabase
      .from('suspension_gameweeks')
      .delete()
      .eq('suspension_id', card.resolved_suspension_id)
    await supabase
      .from('discipline_cards')
      .update({ resolved_suspension_id: null })
      .eq('resolved_suspension_id', card.resolved_suspension_id)
  }

  redirect('/admin/discipline')
}

async function adjustSuspensionGameweeks(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const suspensionId = formData.get('suspension_id') as string
  const direction = formData.get('direction') as 'add' | 'remove'
  const competitionId = formData.get('competition_id') as string

  const { data: linked } = await supabase
    .from('suspension_gameweeks')
    .select('gameweek_id, gameweeks(number, status)')
    .eq('suspension_id', suspensionId)

  const linkedIds = new Set((linked ?? []).map((r: any) => r.gameweek_id))

  if (direction === 'remove' && linked && linked.length > 0) {
    const last = [...linked].sort((a: any, b: any) => b.gameweeks.number - a.gameweeks.number)[0]
    await supabase.from('suspension_gameweeks').delete().eq('suspension_id', suspensionId).eq('gameweek_id', last.gameweek_id)
    await supabase.from('suspensions').update({
      status: 'appealed_reduced',
      gameweeks_count: Math.max(0, (linked.length ?? 1) - 1),
    }).eq('id', suspensionId)
  }

  if (direction === 'add') {
    const { data: candidates } = await supabase
      .from('gameweeks')
      .select('id, number')
      .eq('competition_id', competitionId)
      .in('status', ['upcoming', 'open'])
      .order('number', { ascending: true })
    const next = (candidates ?? []).find(g => !linkedIds.has(g.id))
    if (next) {
      await supabase.from('suspension_gameweeks').insert({ suspension_id: suspensionId, gameweek_id: next.id })
      await supabase.from('suspensions').update({ gameweeks_count: (linked?.length ?? 0) + 1 }).eq('id', suspensionId)
    }
  }

  redirect('/admin/discipline')
}

export default async function DisciplinePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')

  const { data: comp } = await supabase.from('competitions').select('id, name').eq('status', 'active').single()

  if (!comp) {
    return <div><h1 className="text-2xl font-bold mb-4">Discipline</h1><p className="text-gray-500">No active competition.</p></div>
  }

  const [{ data: entries }, { data: gameweeks }, { data: cards }, { data: suspensions }, { data: suspGwLinks }] = await Promise.all([
    supabase.from('competition_entries').select('user_id, profiles(id, display_name, is_bot)').eq('competition_id', comp.id).eq('removed', false),
    supabase.from('gameweeks').select('id, number, status, deadline').eq('competition_id', comp.id).order('number', { ascending: true }),
    supabase.from('discipline_cards').select('id, user_id, card_type, reason, status, created_at, resolved_suspension_id, issued_gameweek_id').eq('competition_id', comp.id).order('created_at', { ascending: false }),
    supabase.from('suspensions').select('id, user_id, suspension_number, gameweeks_count, status, reason, trigger_card_id').eq('competition_id', comp.id).order('created_at', { ascending: false }),
    supabase.from('suspension_gameweeks').select('suspension_id, gameweeks(number)'),
  ])

  const users = (entries ?? [])
    .map((e: any) => e.profiles)
    .filter((p: any) => p && !p.is_bot)
    .map((p: any) => ({ id: p.id, name: p.display_name ?? 'Unknown' }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))

  const nameByUserId: Record<string, string> = {}
  users.forEach(u => { nameByUserId[u.id] = u.name })

  const allGws = gameweeks ?? []
  const futureGws = allGws.filter(g => g.status === 'upcoming' || g.status === 'open')
  const currentOpenGw = allGws.find(g => g.status === 'open')
  const defaultGameweekId = currentOpenGw?.id ?? allGws[0]?.id ?? ''

  // How many unresolved (active, not yet linked to a suspension) yellows
  // each user currently has — drives the "this will trigger a suspension"
  // hint in the issue form.
  const unresolvedYellowCountByUserId: Record<string, number> = {}
  ;(cards ?? []).forEach(c => {
    if (c.card_type === 'yellow' && c.status === 'active' && !c.resolved_suspension_id) {
      unresolvedYellowCountByUserId[c.user_id] = (unresolvedYellowCountByUserId[c.user_id] ?? 0) + 1
    }
  })

  const nextSuspensionNumberByUserId: Record<string, number> = {}
  ;(suspensions ?? []).forEach(s => {
    if (s.status === 'active' || s.status === 'appealed_reduced') {
      nextSuspensionNumberByUserId[s.user_id] = Math.max(nextSuspensionNumberByUserId[s.user_id] ?? 0, s.suspension_number)
    }
  })
  users.forEach(u => { nextSuspensionNumberByUserId[u.id] = (nextSuspensionNumberByUserId[u.id] ?? 0) + 1 })

  const gwNumbersBySuspensionId: Record<string, number[]> = {}
  ;(suspGwLinks ?? []).forEach((r: any) => {
    ;(gwNumbersBySuspensionId[r.suspension_id] ??= []).push(r.gameweeks?.number)
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Discipline</h1>
      <p className="text-gray-500 text-sm mb-6">
        Issue yellow/red cards for any conduct you judge worthy of one. A straight red, or a player&apos;s second
        unresolved yellow this competition, triggers a suspension — they score zero that gameweek but keep every
        team, player, Banker and Bonus Card use untouched. Appeals go through the Sporting Panel off-platform;
        record the outcome here with the Rescind toggle or the gameweek adjusters below.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white border rounded-lg p-6 mb-6">
        <h2 className="font-bold mb-4">Issue a Card</h2>
        <IssueCardForm
          action={issueCard}
          competitionId={comp.id}
          users={users}
          allGameweeks={allGws}
          futureGameweeks={futureGws}
          unresolvedYellowCountByUserId={unresolvedYellowCountByUserId}
          nextSuspensionNumberByUserId={nextSuspensionNumberByUserId}
          defaultGameweekId={defaultGameweekId}
        />
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">History</h2>
        {(cards ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No cards issued yet this competition.</p>
        ) : (
          <div className="space-y-3">
            {(cards ?? []).map(card => {
              const suspension = (suspensions ?? []).find(s => s.id === card.resolved_suspension_id)
              return (
                <div key={card.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm">
                        <span className="mr-1.5">{card.card_type === 'yellow' ? '🟨' : '🟥'}</span>
                        <strong>{nameByUserId[card.user_id] ?? 'Unknown'}</strong>
                        {card.status === 'rescinded' && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Rescinded</span>}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">{card.reason}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(card.created_at).toLocaleDateString()}</p>
                    </div>
                    <form action={toggleCardStatus}>
                      <input type="hidden" name="card_id" value={card.id} />
                      <input type="hidden" name="next_status" value={card.status === 'active' ? 'rescinded' : 'active'} />
                      <button type="submit" className="text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1">
                        {card.status === 'active' ? 'Rescind' : 'Reinstate'}
                      </button>
                    </form>
                  </div>

                  {suspension && (
                    <div className="mt-2 pl-4 border-l-2 border-red-300">
                      <p className="text-xs text-gray-700">
                        Suspension #{suspension.suspension_number} — {suspension.gameweeks_count} gameweek(s){' '}
                        {gwNumbersBySuspensionId[suspension.id]?.length
                          ? `(GW${gwNumbersBySuspensionId[suspension.id].sort((a, b) => a - b).join(', GW')})`
                          : ''}
                        {suspension.status !== 'active' && <span className="ml-1.5 text-gray-400">({suspension.status.replace('_', ' ')})</span>}
                      </p>
                      {suspension.status !== 'appealed_overturned' && (
                        <div className="flex gap-2 mt-1">
                          <form action={adjustSuspensionGameweeks}>
                            <input type="hidden" name="suspension_id" value={suspension.id} />
                            <input type="hidden" name="competition_id" value={comp.id} />
                            <input type="hidden" name="direction" value="remove" />
                            <button type="submit" className="text-xs text-gray-500 hover:text-gray-800">− Remove last gameweek</button>
                          </form>
                          <form action={adjustSuspensionGameweeks}>
                            <input type="hidden" name="suspension_id" value={suspension.id} />
                            <input type="hidden" name="competition_id" value={comp.id} />
                            <input type="hidden" name="direction" value="add" />
                            <button type="submit" className="text-xs text-gray-500 hover:text-gray-800">+ Add another gameweek</button>
                          </form>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

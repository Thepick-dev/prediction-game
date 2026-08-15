import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { generateResetCode as makeResetCode, hashResetCode, RESET_CODE_TTL_HOURS } from '../../lib/auth-identifier'
import { redirect } from 'next/navigation'
import ConfirmDeleteButton from '../components/confirm-delete-button'

// Every privileged write below goes through this — Next.js server actions
// are reachable as their own endpoint, not just "the button on a page only
// admins can see", so the page layout's own admin check isn't actually a
// guarantee for these. Verifies the CALLER's own session (safe — RLS
// already scopes that read to their own row) before ever handing back the
// service-role client these writes need to bypass the column locks in the
// security-fixes SQL.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; kitError?: string; resetCode?: string; resetFor?: string; usernameError?: string }>
}) {
  const { error: deleteError, kitError, resetCode, resetFor, usernameError } = await searchParams
  const supabase = await createServerSupabaseClient()

  // Service-role, not the regular session client — password_reset_requests
  // rows belong to whoever's locked out (often no real session at all,
  // since resolveIdentifier can leave user_id null), so there's no RLS
  // policy that would let an admin's own session see someone else's
  // request. Same trap as the wall moderation reads/writes: reading
  // another user's row needs the service-role client, this page just
  // hadn't needed one until this specific query.
  const admin = createAdminSupabaseClient()
  const { data: resetRequests } = await admin
    .from('password_reset_requests')
    .select('id, identifier, user_id, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  // Same reasoning as resetRequests above — a player's own pending row
  // isn't visible to the admin's regular session, so this uses the
  // service-role client from the start rather than repeating that bug.
  const { data: usernameRequests } = await admin
    .from('username_change_requests')
    .select('id, user_id, current_name, requested_name, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, approved, pending_since')
    .order('approved', { ascending: true })
    .order('pending_since', { ascending: true })

  // Its own isolated request, same reasoning as everywhere else this
  // pattern shows up — is_bot is a newer, optional column (Futzy), and a
  // problem reading it should never take the whole Users page down with it.
  // Futzy is a real profiles/auth.users row so he can hold picks and a
  // competition_entries row like anyone else, but he's not a person to
  // approve/admin/delete here — managed from /admin/futzy instead.
  const { data: botFlags } = await supabase.from('profiles').select('id, is_bot')
  const botIds = new Set((botFlags ?? []).filter(b => b.is_bot).map(b => b.id))
  const profiles = allProfiles?.filter(p => !botIds.has(p.id))

  // Flags pending signups whose account was created after the active
  // competition's Gameweek 1 deadline — they can't join mid-competition,
  // so it's worth knowing which pending users are "just waiting their
  // turn" vs "genuinely can't get in yet" at a glance.
  const { data: activeComp } = await supabase.from('competitions').select('id').eq('status', 'active').single()
  let gw1Deadline: string | null = null
  if (activeComp) {
    const { data: gw1 } = await supabase.from('gameweeks').select('deadline').eq('competition_id', activeComp.id).eq('number', 1).single()
    gw1Deadline = gw1?.deadline ?? null
  }
  function isLateJoiner(pendingSince: string | null) {
    return !!pendingSince && !!gw1Deadline && new Date(pendingSince) > new Date(gw1Deadline)
  }

  // Kept as its own request, same defensive-isolation reason as kit_extras
  // below — if these columns ever have a problem, it should only affect
  // these three toggles, never take down the whole page.
  const { data: roleExtras } = await supabase.from('profiles').select('id, can_post_news, is_super_admin, is_sporting_panel')
  const roleMap: Record<string, { can_post_news: boolean; is_super_admin: boolean; is_sporting_panel: boolean }> = {}
  roleExtras?.forEach(r => {
    roleMap[r.id] = {
      can_post_news: r.can_post_news ?? false,
      is_super_admin: r.is_super_admin ?? false,
      is_sporting_panel: r.is_sporting_panel ?? false,
    }
  })

  // Its own isolated request, same reasoning as everywhere else on this
  // page — these are newer, optional leaderboard-badge columns, and a
  // problem reading them should only affect these three toggles, never
  // take down the whole Users page with it.
  const { data: badgeExtras } = await supabase.from('profiles').select('id, is_reigning_champ, is_vibes_champion, in_cash_pool')
  const badgeMap: Record<string, { is_reigning_champ: boolean; is_vibes_champion: boolean; in_cash_pool: boolean }> = {}
  badgeExtras?.forEach(b => {
    badgeMap[b.id] = {
      is_reigning_champ: b.is_reigning_champ ?? false,
      is_vibes_champion: b.is_vibes_champion ?? false,
      in_cash_pool: b.in_cash_pool ?? false,
    }
  })

  // Kept as its own request, deliberately separate from the profiles query
  // above: if these columns ever have a problem, it should only affect kit
  // badges, never take down the whole Users page with it.
  const { data: kitExtras } = await supabase.from('profiles').select('id, kit_stars, kit_earths')
  const kitExtrasMap: Record<string, { kit_stars: number; kit_earths: number }> = {}
  kitExtras?.forEach(k => { kitExtrasMap[k.id] = { kit_stars: k.kit_stars ?? 0, kit_earths: k.kit_earths ?? 0 } })

  // auth.admin.* endpoints need the service role key — the regular client
  // above (anon key + cookies) doesn't have permission to call them, which
  // is why this silently returned nothing before.
  const { data: authUsers } = await createAdminSupabaseClient().auth.admin.listUsers()

  const emailMap: Record<string, string> = {}
  authUsers?.users?.forEach(u => { emailMap[u.id] = u.email ?? '' })

  const displayNameMap: Record<string, string> = {}
  profiles?.forEach(p => { displayNameMap[p.id] = p.display_name ?? '' })

  // These five actions all write privileged fields (is_admin, approved,
  // role flags, leaderboard badges, kit stars) or another user's row —
  // never the regular session client, for two reasons at once: RLS
  // scoped to "your own row" would silently do nothing when an admin
  // edits someone ELSE's row (the same class of bug that hit Futzy's
  // competition_entries and Wall moderation earlier), and — the more
  // important one — these columns are locked down at the database level
  // (see the security-fixes SQL) so a normal signed-in user can't grant
  // themselves is_admin by calling the API directly. Only the service
  // role can write them at all now; there's no "trust the UI hid the
  // button" step in between.
  async function updateDisplayName(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    const display_name = formData.get('display_name') as string
    await admin.from('profiles').update({ display_name }).eq('id', id)
    redirect('/admin/users')
  }

  async function toggleApproved(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    const approved = formData.get('approved') === 'true'
    await admin.from('profiles').update({ approved: !approved }).eq('id', id)
    redirect('/admin/users')
  }

  async function toggleAdmin(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    const is_admin = formData.get('is_admin') === 'true'
    await admin.from('profiles').update({ is_admin: !is_admin }).eq('id', id)
    redirect('/admin/users')
  }

  async function toggleFlag(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    const field = formData.get('field') as 'can_post_news' | 'is_super_admin' | 'is_sporting_panel' | 'is_reigning_champ' | 'is_vibes_champion' | 'in_cash_pool'
    const current = formData.get('current') === 'true'
    await admin.from('profiles').update({ [field]: !current }).eq('id', id)
    redirect('/admin/users')
  }

  async function updateKitBadges(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    const kit_stars = Math.max(0, Math.min(5, parseInt(formData.get('kit_stars') as string) || 0))
    const kit_earths = Math.max(0, Math.min(5, parseInt(formData.get('kit_earths') as string) || 0))
    const { error } = await admin.from('profiles').update({ kit_stars, kit_earths }).eq('id', id)
    if (error) {
      redirect(`/admin/users?kitError=${encodeURIComponent(error.message)}`)
    }
    redirect('/admin/users')
  }

  async function deleteUser(formData: FormData) {
    'use server'
    // Same reason as listUsers above — this needs the service role client,
    // not the regular per-request one, or it fails. requireAdminAction is
    // what actually gates it — deleting an account is destructive, this
    // can't rely on "the button is hidden" alone.
    const admin = await requireAdminAction()
    const id = formData.get('id') as string

    // Deletes everything that references this user first — the database
    // blocks removing a user who still has picks, entries, or other data
    // attached, and auth.admin.deleteUser() would otherwise just fail with
    // an unhelpful error further down. Same shape as deleteCompetition's
    // cascade on the Competitions page.
    const { data: userPicks } = await admin.from('picks').select('id').eq('user_id', id)
    const pickIds = (userPicks ?? []).map(p => p.id)

    if (pickIds.length > 0) {
      await admin.from('wall_replies').delete().in('pick_id', pickIds)
      await admin.from('points').delete().in('pick_id', pickIds)
      await admin.from('all_or_nothing_picks').delete().in('pick_id', pickIds)
      await admin.from('bonus_card_plays').delete().in('pick_id', pickIds)
    }
    await admin.from('wall_replies').delete().eq('user_id', id)
    await admin.from('picks').delete().eq('user_id', id)
    await admin.from('competition_entries').delete().eq('user_id', id)
    await admin.from('tier_draft_picks').delete().eq('user_id', id)
    await admin.from('username_change_requests').delete().eq('user_id', id)
    await admin.from('password_reset_requests').delete().eq('user_id', id)
    await admin.from('password_reset_codes').delete().eq('user_id', id)
    await admin.from('wall_ratings').delete().eq('rater_user_id', id)
    await admin.from('profiles').delete().eq('id', id)

    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) {
      redirect(`/admin/users?error=${encodeURIComponent(error.message)}`)
    }
    redirect('/admin/users')
  }

  async function generateResetCode(formData: FormData) {
    'use server'
    // Same reason — a reset code hands over account access, this must
    // never be reachable by anyone but a verified admin.
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    const requestId = formData.get('requestId') as string | null
    const displayName = formData.get('displayName') as string

    // Only one live code per user at a time — invalidate anything still
    // outstanding from an earlier generation so there's never ambiguity
    // about which code is the real one.
    await admin.from('password_reset_codes').update({ used_at: new Date().toISOString() }).eq('user_id', id).is('used_at', null)

    const code = makeResetCode()
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_HOURS * 60 * 60 * 1000).toISOString()
    await admin.from('password_reset_codes').insert({ user_id: id, code_hash: hashResetCode(code), expires_at: expiresAt })

    if (requestId) {
      await admin.from('password_reset_requests').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', requestId)
    }

    redirect(`/admin/users?resetCode=${encodeURIComponent(code)}&resetFor=${encodeURIComponent(displayName || 'this player')}`)
  }

  // Clears a request out of the queue without generating a code — for
  // ones already handled some other way, or that turn out not to need
  // action at all (a stale test account, a duplicate of another request).
  async function dismissResetRequest(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const requestId = formData.get('requestId') as string
    await admin.from('password_reset_requests').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', requestId)
    redirect('/admin/users')
  }

  async function approveUsernameChange(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    const userId = formData.get('user_id') as string
    const requestedName = formData.get('requested_name') as string

    const { error } = await admin.from('profiles').update({ display_name: requestedName }).eq('id', userId)
    if (error) {
      redirect(`/admin/users?usernameError=${encodeURIComponent(error.message.includes('unique') ? 'That username is already taken' : error.message)}`)
    }

    await admin.from('username_change_requests').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', id)
    redirect('/admin/users')
  }

  async function rejectUsernameChange(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    await admin.from('username_change_requests').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', id)
    redirect('/admin/users')
  }

  const pending = profiles?.filter(p => !p.approved) ?? []
  const approved = profiles?.filter(p => p.approved) ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Users</h1>
        <a href="/api/admin/export-emails" className="text-xs border rounded px-3 py-1.5 hover:bg-gray-50">
          ⬇ Export all emails (CSV)
        </a>
      </div>

      {deleteError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">
          Couldn&apos;t delete that user: {deleteError}. They likely still have picks or other data attached —
          you may need to remove those first, or this account may need to stay for the game&apos;s history.
        </div>
      )}

      {kitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">
          Couldn&apos;t save kit badges: {kitError}. If this mentions a missing column, the{' '}
          <code className="bg-red-100 px-1 rounded">kit_stars</code>/<code className="bg-red-100 px-1 rounded">kit_earths</code> columns
          haven&apos;t been added to the database yet — run the SQL Claude gave you for this feature first.
        </div>
      )}

      {usernameError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">
          Couldn&apos;t approve that username change: {usernameError}
        </div>
      )}

      {resetCode && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-green-800">
            Reset code for <strong>{resetFor}</strong> — give this to them now, it won&apos;t be shown again:
          </p>
          <p className="text-2xl font-mono font-bold tracking-widest text-green-900 mt-1 select-all">{resetCode}</p>
          <p className="text-xs text-green-700 mt-1">Valid for {RESET_CODE_TTL_HOURS} hours, one use only.</p>
        </div>
      )}

      {resetRequests && resetRequests.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="font-bold mb-4 text-blue-800">🔑 Password Reset Requests ({resetRequests.length})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Entered</th>
                <th className="pb-2">Matched Account</th>
                <th className="pb-2">Requested</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {resetRequests.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 text-sm">{r.identifier}</td>
                  <td className="py-2 text-sm">
                    {r.user_id
                      ? `${displayNameMap[r.user_id] || '(no username set)'} — ${emailMap[r.user_id] ?? '—'}`
                      : <span className="text-red-500">No matching account found</span>}
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
                    })}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.user_id ? (
                        <form action={generateResetCode}>
                          <input type="hidden" name="id" value={r.user_id} />
                          <input type="hidden" name="requestId" value={r.id} />
                          <input type="hidden" name="displayName" value={displayNameMap[r.user_id] || emailMap[r.user_id] || ''} />
                          <button type="submit" className="bg-blue-600 text-white text-xs rounded px-3 py-1">
                            Generate code
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      <form action={dismissResetRequest}>
                        <input type="hidden" name="requestId" value={r.id} />
                        <button type="submit" className="text-xs text-gray-500 hover:text-gray-700 border rounded px-3 py-1">
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {usernameRequests && usernameRequests.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-8">
          <h2 className="font-bold mb-4 text-purple-800">✏️ Username Change Requests ({usernameRequests.length})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Current</th>
                <th className="pb-2">Requested</th>
                <th className="pb-2">Asked</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {usernameRequests.map(r => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 text-sm">{r.current_name}</td>
                  <td className="py-2 text-sm font-bold">{r.requested_name}</td>
                  <td className="py-2 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
                    })}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <form action={approveUsernameChange}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="user_id" value={r.user_id} />
                        <input type="hidden" name="requested_name" value={r.requested_name} />
                        <button type="submit" className="bg-green-600 text-white text-xs rounded px-3 py-1">
                          ✓ Approve
                        </button>
                      </form>
                      <form action={rejectUsernameChange}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="bg-gray-500 text-white text-xs rounded px-3 py-1">
                          ✗ Reject
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h2 className="font-bold mb-4 text-yellow-800">⏳ Pending Approval ({pending.length})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">Email</th>
                <th className="pb-2">Display Name</th>
                <th className="pb-2">Waiting Since</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(profile => (
                <tr key={profile.id} className="border-b last:border-0">
                  <td className="py-2 text-sm">{emailMap[profile.id] ?? '—'}</td>
                  <td className="py-2">
                    {profile.display_name ?? <span className="text-gray-400">Not set</span>}
                    {isLateJoiner(profile.pending_since) && (
                      <span className="ml-2 text-[10px] font-bold uppercase bg-red-100 text-red-700 rounded px-1.5 py-0.5" title="Signed up after this competition's Gameweek 1 deadline">
                        Missed GW1
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-gray-500">
                    {profile.pending_since ? new Date(profile.pending_since).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
                    }) : '—'}
                  </td>
                  <td className="py-2">
                    <form action={toggleApproved}>
                      <input type="hidden" name="id" value={profile.id} />
                      <input type="hidden" name="approved" value="false" />
                      <button type="submit" className="bg-green-600 text-white text-xs rounded px-3 py-1">
                        ✓ Approve
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">All Users ({profiles?.length ?? 0})</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Email</th>
              <th className="pb-2">Display Name</th>
              <th className="pb-2">Approved</th>
              <th className="pb-2">Admin</th>
              <th className="pb-2">News Author</th>
              <th className="pb-2">Super Admin</th>
              <th className="pb-2">Sporting Panel</th>
              <th className="pb-2">Reigning Champ</th>
              <th className="pb-2">Vibes Champion</th>
              <th className="pb-2">Cash Pool</th>
              <th className="pb-2">Edit Name</th>
              <th className="pb-2">Kit Badges</th>
              <th className="pb-2">Reset Password</th>
              <th className="pb-2">Delete</th>
            </tr>
          </thead>
          <tbody>
            {profiles?.map(profile => {
              const roles = roleMap[profile.id] ?? { can_post_news: false, is_super_admin: false, is_sporting_panel: false }
              const badges = badgeMap[profile.id] ?? { is_reigning_champ: false, is_vibes_champion: false, in_cash_pool: false }
              return (
              <tr key={profile.id} className="border-b last:border-0">
                <td className="py-2 text-xs text-gray-500">{emailMap[profile.id] ?? '—'}</td>
                <td className="py-2">{profile.display_name ?? <span className="text-gray-400">Not set</span>}</td>
                <td className="py-2">
                  <form action={toggleApproved}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="approved" value={String(profile.approved ?? false)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${profile.approved ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                      {profile.approved ? '✓ Approved' : '✗ Pending'}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={toggleAdmin}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="is_admin" value={String(profile.is_admin ?? false)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${profile.is_admin ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                      {profile.is_admin ? 'Admin' : 'Player'}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={toggleFlag}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="field" value="can_post_news" />
                    <input type="hidden" name="current" value={String(roles.can_post_news)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${roles.can_post_news ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {roles.can_post_news ? '✓ Author' : '— No'}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={toggleFlag}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="field" value="is_super_admin" />
                    <input type="hidden" name="current" value={String(roles.is_super_admin)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${roles.is_super_admin ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {roles.is_super_admin ? '✓ Super' : '— No'}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={toggleFlag}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="field" value="is_sporting_panel" />
                    <input type="hidden" name="current" value={String(roles.is_sporting_panel)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${roles.is_sporting_panel ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {roles.is_sporting_panel ? '✓ Panel' : '— No'}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={toggleFlag}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="field" value="is_reigning_champ" />
                    <input type="hidden" name="current" value={String(badges.is_reigning_champ)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${badges.is_reigning_champ ? 'bg-lime-50 text-lime-700 border-lime-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {badges.is_reigning_champ ? '👑 Champ' : '— No'}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={toggleFlag}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="field" value="is_vibes_champion" />
                    <input type="hidden" name="current" value={String(badges.is_vibes_champion)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${badges.is_vibes_champion ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {badges.is_vibes_champion ? '😎 Vibes' : '— No'}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={toggleFlag}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="field" value="in_cash_pool" />
                    <input type="hidden" name="current" value={String(badges.in_cash_pool)} />
                    <button type="submit" className={`text-xs px-2 py-1 rounded border ${badges.in_cash_pool ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                      {badges.in_cash_pool ? '💷 In' : '— No'}
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={updateDisplayName} className="flex gap-1">
                    <input type="hidden" name="id" value={profile.id} />
                    <input
                      type="text"
                      name="display_name"
                      defaultValue={profile.display_name ?? ''}
                      placeholder="Set name"
                      className="text-xs border rounded px-2 py-1"
                    />
                    <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save</button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={updateKitBadges} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={profile.id} />
                    <label className="flex items-center gap-1 text-xs">
                      ★
                      <input
                        type="number" name="kit_stars" min={0} max={5}
                        defaultValue={kitExtrasMap[profile.id]?.kit_stars ?? 0}
                        className="w-12 border rounded px-1 py-1 text-xs"
                      />
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      🌍
                      <input
                        type="number" name="kit_earths" min={0} max={5}
                        defaultValue={kitExtrasMap[profile.id]?.kit_earths ?? 0}
                        className="w-12 border rounded px-1 py-1 text-xs"
                      />
                    </label>
                    <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save</button>
                  </form>
                </td>
                <td className="py-2">
                  <form action={generateResetCode}>
                    <input type="hidden" name="id" value={profile.id} />
                    <input type="hidden" name="displayName" value={profile.display_name || emailMap[profile.id] || ''} />
                    <button type="submit" className="text-xs border rounded px-2 py-1 hover:bg-gray-100">
                      Generate code
                    </button>
                  </form>
                </td>
                <td className="py-2">
                  <ConfirmDeleteButton
                    action={deleteUser}
                    hiddenFields={{ id: profile.id }}
                    confirmText={`Permanently delete ${emailMap[profile.id] || profile.display_name || 'this user'}? This cannot be undone.`}
                  />
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
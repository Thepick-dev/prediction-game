import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'
import ConfirmDeleteButton from '../components/confirm-delete-button'

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; kitError?: string }>
}) {
  const { error: deleteError, kitError } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, approved, pending_since')
    .order('approved', { ascending: true })
    .order('pending_since', { ascending: true })

  // Kept as its own request, deliberately separate from the profiles query
  // above: if these columns ever have a problem, it should only affect kit
  // badges, never take down the whole Users page with it.
  const { data: kitExtras } = await supabase.from('profiles').select('id, kit_stars, kit_earths')
  const kitExtrasMap: Record<string, { kit_stars: number; kit_earths: number }> = {}
  kitExtras?.forEach(k => { kitExtrasMap[k.id] = { kit_stars: k.kit_stars ?? 0, kit_earths: k.kit_earths ?? 0 } })

  const { data: authUsers } = await supabase.auth.admin.listUsers()

  const emailMap: Record<string, string> = {}
  authUsers?.users?.forEach(u => { emailMap[u.id] = u.email ?? '' })

  async function updateDisplayName(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    const display_name = formData.get('display_name') as string
    await supabase.from('profiles').update({ display_name }).eq('id', id)
    redirect('/admin/users')
  }

  async function toggleApproved(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    const approved = formData.get('approved') === 'true'
    await supabase.from('profiles').update({ approved: !approved }).eq('id', id)
    redirect('/admin/users')
  }

  async function toggleAdmin(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    const is_admin = formData.get('is_admin') === 'true'
    await supabase.from('profiles').update({ is_admin: !is_admin }).eq('id', id)
    redirect('/admin/users')
  }

  async function updateKitBadges(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    const kit_stars = Math.max(0, Math.min(5, parseInt(formData.get('kit_stars') as string) || 0))
    const kit_earths = Math.max(0, Math.min(5, parseInt(formData.get('kit_earths') as string) || 0))
    const { error } = await supabase.from('profiles').update({ kit_stars, kit_earths }).eq('id', id)
    if (error) {
      redirect(`/admin/users?kitError=${encodeURIComponent(error.message)}`)
    }
    redirect('/admin/users')
  }

  async function deleteUser(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) {
      redirect(`/admin/users?error=${encodeURIComponent(error.message)}`)
    }
    redirect('/admin/users')
  }

  const pending = profiles?.filter(p => !p.approved) ?? []
  const approved = profiles?.filter(p => p.approved) ?? []

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Users</h1>

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
                  <td className="py-2">{profile.display_name ?? <span className="text-gray-400">Not set</span>}</td>
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
              <th className="pb-2">Edit Name</th>
              <th className="pb-2">Kit Badges</th>
              <th className="pb-2">Delete</th>
            </tr>
          </thead>
          <tbody>
            {profiles?.map(profile => (
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
                  <ConfirmDeleteButton
                    action={deleteUser}
                    hiddenFields={{ id: profile.id }}
                    confirmText={`Permanently delete ${emailMap[profile.id] || profile.display_name || 'this user'}? This cannot be undone.`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function UsersPage() {
  const supabase = await createServerSupabaseClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin, approved, pending_since')
    .order('approved', { ascending: true })
    .order('pending_since', { ascending: true })

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

  const pending = profiles?.filter(p => !p.approved) ?? []
  const approved = profiles?.filter(p => p.approved) ?? []

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Users</h1>

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
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
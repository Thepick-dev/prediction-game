import { createServerSupabaseClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function UsersPage() {
  const supabase = await createServerSupabaseClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, is_admin')
    .order('display_name')

  async function updateDisplayName(formData: FormData) {
    'use server'
    const supabase = await createServerSupabaseClient()
    const id = formData.get('id') as string
    const display_name = formData.get('display_name') as string

    await supabase
      .from('profiles')
      .update({ display_name })
      .eq('id', id)

    redirect('/admin/users')
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Users</h1>
      <p className="text-gray-500 text-sm mb-6">View and edit player display names. Useful if a name is inappropriate or needs correcting.</p>

      <div className="bg-white border rounded-lg p-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2">Display Name</th>
              <th className="pb-2">Admin</th>
              <th className="pb-2">Edit</th>
            </tr>
          </thead>
          <tbody>
            {profiles?.map(profile => (
              <tr key={profile.id} className="border-b last:border-0">
                <td className="py-2">{profile.display_name ?? <span className="text-gray-400">Not set</span>}</td>
                <td className="py-2">
                  {profile.is_admin && (
                    <span className="text-xs bg-black text-white px-2 py-0.5 rounded">Admin</span>
                  )}
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
                    <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!profiles || profiles.length === 0) && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-gray-400">No users yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
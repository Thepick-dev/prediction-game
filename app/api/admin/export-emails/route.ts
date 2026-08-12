import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const { data: authUsers } = await createAdminSupabaseClient().auth.admin.listUsers()
  const { data: profiles } = await supabase.from('profiles').select('id, display_name')
  const nameById: Record<string, string> = {}
  profiles?.forEach(p => { nameById[p.id] = p.display_name ?? '' })

  // Its own isolated request, same reasoning as everywhere else this
  // pattern shows up — is_bot is a newer, optional column (Futzy), and a
  // problem reading it should never take usernames down with it.
  const { data: botFlags } = await supabase.from('profiles').select('id, is_bot')
  const botIds = new Set((botFlags ?? []).filter(b => b.is_bot).map(b => b.id))

  const rows = [['username', 'email']]
  authUsers?.users?.forEach(u => {
    // Futzy has a real auth.users row (so he can hold picks) but no real
    // email — never worth exporting to anyone.
    if (u.email && !botIds.has(u.id)) rows.push([nameById[u.id] ?? '', u.email])
  })

  const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="lms-all-stars-emails.csv"',
    },
  })
}

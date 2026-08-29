import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { requireAdmin } from '../../../lib/require-admin'
import { syncResults } from '../../../lib/syncResults'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = await createServerSupabaseClient()
  if (!(await requireAdmin(supabase))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 })
  }

  const result = await syncResults(supabase)
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}

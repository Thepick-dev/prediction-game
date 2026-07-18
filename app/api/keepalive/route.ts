import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()

  // A trivial read query — just enough to count as real database activity
  // and prevent Supabase's free-tier inactivity pause.
  const { error } = await supabase
    .from('competitions')
    .select('id')
    .limit(1)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, timestamp: new Date().toISOString() })
}
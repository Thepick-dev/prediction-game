import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { competition_id, tier1_team_id, tier2_team_id, tier3_team_id } = await request.json()

  if (!competition_id || !tier1_team_id || !tier2_team_id || !tier3_team_id) {
    return NextResponse.json({ error: 'Please select one team from each tier' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('tier_draft_picks')
    .select('locked')
    .eq('user_id', user.id)
    .eq('competition_id', competition_id)
    .single()

  if (existing?.locked) {
    return NextResponse.json({ error: 'Your tier picks are locked and can no longer be changed' }, { status: 400 })
  }

  const { error } = await supabase
    .from('tier_draft_picks')
    .upsert({
      user_id: user.id,
      competition_id,
      tier1_team_id,
      tier2_team_id,
      tier3_team_id,
    }, { onConflict: 'user_id,competition_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: existingEntry } = await supabase
    .from('competition_entries')
    .select('id')
    .eq('user_id', user.id)
    .eq('competition_id', competition_id)
    .single()

  if (!existingEntry) {
    await supabase.from('competition_entries').insert({ user_id: user.id, competition_id })
  }

  return NextResponse.json({ success: true })
}

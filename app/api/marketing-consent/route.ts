import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { NextResponse } from 'next/server'

// Answers are read/written for the CALLER's own row only, but through the
// service role regardless — marketing_consent_answers has RLS enabled
// with no policy defined (same reasoning as signup_invite_codes), so a
// regular session can't touch it at all, not even its own rows, without
// a policy that doesn't exist yet. The real access control here is
// "whichever user_id the caller's own session resolves to", enforced in
// this route, not by RLS.
async function requireCaller() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET() {
  const user = await requireCaller()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const admin = createAdminSupabaseClient()
  const { data } = await admin.from('marketing_consent_answers').select('question_id, consented').eq('user_id', user.id)

  return NextResponse.json({ answers: data ?? [] })
}

export async function POST(request: Request) {
  const user = await requireCaller()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { answers } = await request.json()
  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: 'Invalid answers' }, { status: 400 })
  }

  const admin = createAdminSupabaseClient()
  const rows = answers
    .filter((a: any) => a?.questionId && typeof a?.consented === 'boolean')
    .map((a: any) => ({
      user_id: user.id,
      question_id: a.questionId,
      consented: a.consented,
      answered_at: new Date().toISOString(),
    }))

  if (rows.length === 0) return NextResponse.json({ success: true })

  const { error } = await admin.from('marketing_consent_answers').upsert(rows, { onConflict: 'user_id,question_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}

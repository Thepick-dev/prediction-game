import { createServerSupabaseClient } from '../../lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServerSupabaseClient()
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  const { data: gameweeks } = await supabase
    .from('gameweeks')
    .select('id, competition_id, deadline, status')
    .in('status', ['open', 'upcoming'])
    .lt('deadline', now.toISOString())
    .gt('deadline', oneHourAgo.toISOString())

  if (!gameweeks || gameweeks.length === 0) {
    return NextResponse.json({ success: true, message: 'No gameweeks to process' })
  }

  const results = []

  for (const gw of gameweeks) {
    await supabase
      .from('gameweeks')
      .update({ status: 'locked' })
      .eq('id', gw.id)

    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/autopick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameweek_id: gw.id })
    })

    const data = await res.json()
    results.push({ gameweek_id: gw.id, ...data })
  }

  return NextResponse.json({ success: true, results })
}
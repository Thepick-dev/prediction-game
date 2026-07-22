import { createServerSupabaseClient } from '../../lib/supabase-server'
import { runAutopickForGameweek } from '../../lib/autopick'
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Autopick route active' })
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()

  const { gameweek_id } = await request.json()

  if (!gameweek_id) {
    return NextResponse.json({ error: 'gameweek_id is required' }, { status: 400 })
  }

  const result = await runAutopickForGameweek(supabase, gameweek_id)

  if ('error' in result) {
    const status = result.error === 'Gameweek not found' ? 404 : 400
    return NextResponse.json(result, { status })
  }

  return NextResponse.json(result)
}

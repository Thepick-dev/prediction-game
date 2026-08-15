import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { requireUser } from '../../../lib/require-admin'
import { NextResponse } from 'next/server'

// The only way a crest image is ever served — never a static /public file,
// never the real upstream URL handed to the client directly. Requires a
// real session (any logged-in player, not admin-only) and proxies the
// actual image bytes through this server rather than redirecting to the
// upstream source, which would leak that URL in the browser's network
// tab regardless of the 401 gate on this route itself.
export async function GET(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const supabase = await createServerSupabaseClient()
  const user = await requireUser(supabase)
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { teamId } = await params
  const id = parseInt(teamId, 10)
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid team' }, { status: 400 })

  const { data: team } = await supabase.from('teams').select('crest_url').eq('id', id).single()
  if (!team?.crest_url) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const upstream = await fetch(team.crest_url)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Could not fetch crest' }, { status: 502 })
  }

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'image/png',
      // Private — caches on the logged-in user's own device only, never
      // a shared/public cache, consistent with this never being a public
      // asset.
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

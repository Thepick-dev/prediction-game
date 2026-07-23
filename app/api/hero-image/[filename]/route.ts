import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

// Hero images live outside `public/` on purpose — files under `public/` are
// always served to anyone regardless of login, so serving them from here
// instead lets us actually check the visitor is signed in first. Matches
// either a numbered pool image (hero-01-desktop.png) or a named one-off
// override (hero-trophy-desktop.png) — never anything with a slash or
// "..", so this can't be used to read any other file on disk.
const FILENAME_PATTERN = /^hero-[a-z0-9]{2,20}-(desktop|mobile)\.png$/

export async function GET(request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { filename } = await params

  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const filePath = path.join(process.cwd(), 'private', 'hero-images', filename)
    const file = await readFile(filePath)
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

// Hero images live outside `public/` on purpose — files under `public/` are
// always served to anyone regardless of login, so serving them from here
// instead lets us actually check the visitor is signed in first.
const FILENAME_PATTERN = /^hero-\d{2}-(desktop|mobile)\.png$/

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

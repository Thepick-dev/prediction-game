import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    await supabase.auth.exchangeCodeForSession(code)

    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, approved, pending_since')
        .eq('id', user.id)
        .single()

      if (profile && !profile.approved && !profile.pending_since) {
        await supabase
          .from('profiles')
          .update({ pending_since: new Date().toISOString() })
          .eq('id', user.id)
      }

      if (!profile) {
        await supabase
          .from('profiles')
          .insert({
            id: user.id,
            approved: false,
            pending_since: new Date().toISOString()
          })
      }
    }
  }

  return NextResponse.redirect(`${origin}/`)
}
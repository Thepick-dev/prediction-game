import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const publicPaths = ['/login', '/pending', '/auth', '/news', '/reset-password', '/cancelled']
  const isPublicPath = publicPaths.some(p => pathname.startsWith(p))
  const isAdminPath = pathname.startsWith('/admin')
  const isApiPath = pathname.startsWith('/api')

  if (isApiPath || isPublicPath) {
    return supabaseResponse
  }

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('approved, is_admin, is_super_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.approved && !isAdminPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/pending'
    return NextResponse.redirect(url)
  }

  // Cosmetic pause, not a functional one — deadlines/autopick/scoring keep
  // running exactly as normal underneath (an explicit choice, see the
  // discipline-system-adjacent "Pause Game" feature); this only decides
  // what a non-admin sees when they load a page. Admins bypass it
  // everywhere, not just under /admin, so they can still see the real
  // leaderboard/wall/etc. while managing whatever prompted the pause.
  const isAdmin = !!(profile?.is_admin || profile?.is_super_admin)
  if (!isAdmin && !isAdminPath) {
    const { data: comp } = await supabase.from('competitions').select('paused').eq('status', 'active').single()
    if (comp?.paused) {
      const url = request.nextUrl.clone()
      url.pathname = '/cancelled'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|images|favicon.ico).*)'],
}
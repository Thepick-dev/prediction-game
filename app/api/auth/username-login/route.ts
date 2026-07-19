import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { username, password } = await request.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('display_name', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Username not found' }, { status: 400 })
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(profile.id)

  if (userError || !userData?.user?.email) {
    return NextResponse.json({ error: 'Account not found' }, { status: 400 })
  }

  const supabasePublic = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: signInData, error: signInError } = await supabasePublic.auth.signInWithPassword({
    email: userData.user.email,
    password,
  })

  if (signInError || !signInData.session) {
    return NextResponse.json({ error: 'Incorrect username or password' }, { status: 400 })
  }

  return NextResponse.json({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token,
  })
}
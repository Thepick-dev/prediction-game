import type { SupabaseClient } from '@supabase/supabase-js'

// A plain DB table rather than an in-memory counter — Vercel serverless
// functions don't share memory between invocations (or even reliably
// within "the same" one across cold starts), so an in-memory counter would
// silently reset constantly and protect almost nothing. This costs one
// extra query per attempt, which is fine at this app's scale, and needs no
// new external service/signup.
export async function checkRateLimit(
  supabaseAdmin: SupabaseClient,
  bucket: string,
  opts: { max: number; windowSeconds: number }
): Promise<boolean> {
  const since = new Date(Date.now() - opts.windowSeconds * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from('rate_limit_hits')
    .select('id', { count: 'exact', head: true })
    .eq('bucket', bucket)
    .gte('created_at', since)

  if ((count ?? 0) >= opts.max) return false

  await supabaseAdmin.from('rate_limit_hits').insert({ bucket })
  return true
}

// Best-effort — Vercel sets x-forwarded-for on every request; falls back
// to a constant so a missing header degrades to "one shared bucket"
// rather than throwing or silently skipping the check entirely.
export function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

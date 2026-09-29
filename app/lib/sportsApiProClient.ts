// Shared low-level client for SportsAPI Pro (sportsapipro.com) — the one
// place that knows the base URL and auth header, used by both the
// original Six Nations sync (rugbySportsApiSync.ts) and the newer
// multi-competition external performance sync
// (rugbyExternalPerformanceSync.ts), so there's a single source of truth
// for "how we talk to this API," not two.

export const SPORTS_API_PRO_BASE = 'https://api.sportsapipro.com/v2/rugby/api'

// The free tier has TWO limits, not one: 100/day (which the pull loops
// already budget for) and 10/minute (found live this session — a first
// pull with no pacing fired requests back-to-back, tripped "Rate limit
// exceeded" repeatedly, and those failed attempts still burned real daily
// quota, blowing well past the intended safety budget). A simple sliding
// window: before each request, drop timestamps older than 60s, and if
// the 10th-oldest remaining one is still inside the window, wait out the
// difference. Module-level state is fine — this process only ever talks
// to one SportsAPI Pro account.
const RATE_LIMIT_PER_MINUTE = 10
const recentRequestTimestamps: number[] = []

async function waitForRateLimitSlot(): Promise<void> {
  const now = Date.now()
  while (recentRequestTimestamps.length > 0 && now - recentRequestTimestamps[0] > 60_000) {
    recentRequestTimestamps.shift()
  }
  if (recentRequestTimestamps.length >= RATE_LIMIT_PER_MINUTE) {
    const oldest = recentRequestTimestamps[0]
    const waitMs = 60_000 - (now - oldest) + 250 // small safety margin
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs))
    return waitForRateLimitSlot()
  }
}

export async function sportsApiProGet(path: string, apiKey: string): Promise<any> {
  await waitForRateLimitSlot()
  recentRequestTimestamps.push(Date.now())
  const res = await fetch(`${SPORTS_API_PRO_BASE}${path}`, { headers: { 'x-api-key': apiKey } })
  const body = await res.json()
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `SportsAPI Pro request failed (${res.status})`)
  }
  return body
}

export type SportsApiQuota = { requestsToday: number; dailyLimit: number; remaining: number }

// /status itself returns success:false once the daily cap is already
// spent (confirmed live this session: "Daily limit of 100 requests
// exceeded"), which sportsApiProGet treats as a thrown error — but "you
// have 0 left" is exactly the answer callers need here, not a crash. A
// crashed quota check took down the whole admin pull action this
// session (real, unhandled exception, not a hypothetical).
export async function sportsApiProQuota(apiKey: string): Promise<SportsApiQuota> {
  const res = await fetch(`${SPORTS_API_PRO_BASE}/status`, { headers: { 'x-api-key': apiKey } })
  const body = await res.json()
  if (body?.success === false && typeof body.current_usage === 'number' && typeof body.limit === 'number') {
    return { requestsToday: body.current_usage, dailyLimit: body.limit, remaining: Math.max(0, body.limit - body.current_usage) }
  }
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || `SportsAPI Pro request failed (${res.status})`)
  }
  return {
    requestsToday: body.usage.requests_today,
    dailyLimit: body.usage.daily_limit,
    remaining: body.usage.remaining,
  }
}

// Every player-statistics response shares this shape regardless of
// competition — confirmed live this session against both Six Nations and
// a Rugby Championship match. One parser for both syncs.
export type SportsApiPlayerStatEntry = {
  player: { id: number; name: string; jerseyNumber?: string; country?: { name?: string; alpha2?: string } }
  // The match-specific shirt number. NOT the same as player.jerseyNumber
  // above, which is that player's stored default/profile number and can be
  // stale or wrong (confirmed live: showed "0" for a player who actually
  // wore 2 in this match) — always prefer this field for position inference.
  shirtNumber?: number
  substitute: boolean
  statistics: {
    points?: number; carries?: number; cleanBreaks?: number; metersRun?: number; offloads?: number
    passes?: number; tacklesMissed?: number; tackles?: number; tryAssists?: number
    penaltyGoals?: number; tries?: number; dropGoals?: number; conversions?: number
    yellowCard?: number; redCard?: number
  }
}

export function extractPlayerStatEntries(data: { home?: any[]; away?: any[] }): { side: 'home' | 'away'; entry: SportsApiPlayerStatEntry }[] {
  const out: { side: 'home' | 'away'; entry: SportsApiPlayerStatEntry }[] = []
  ;(data.home ?? []).forEach(entry => out.push({ side: 'home', entry }))
  ;(data.away ?? []).forEach(entry => out.push({ side: 'away', entry }))
  return out
}

// Team-level match stats (from /match/{id}/statistics, NOT
// /player-statistics) — confirmed live this session that this feeds
// exactly what rugbyRating.ts's pack bonus needs (scrum %, lineout %,
// turnovers, penalties conceded), and that nothing was ever fetching it.
export type SportsApiTeamStats = {
  scrumsWon: number | null
  scrumsAttempted: number | null
  lineoutsWon: number | null
  lineoutsAttempted: number | null
  turnoversWon: number
  turnoversConceded: number
  penaltiesConceded: number
}

function parseAccuracy(raw: string | undefined): { won: number | null; attempted: number | null } {
  const m = raw?.match(/(\d+)\/(\d+)/)
  return m ? { won: Number(m[1]), attempted: Number(m[2]) } : { won: null, attempted: null }
}

// The response groups stats under named sections (Possession/Scoring/
// Other/Penalty/...) — looked up by each stat's own `key`, not by which
// group it's filed under, since group membership isn't guaranteed
// stable across competitions or sports tiers. Returns null if the
// response doesn't carry enough for the pack formula (rather than
// guessing zeroes), so callers can skip storing an empty/wrong row.
export function extractTeamStats(data: { statistics?: { groups?: { statisticsItems?: any[] }[] }[] }): { home: SportsApiTeamStats; away: SportsApiTeamStats } | null {
  const groups = data?.statistics?.[0]?.groups
  if (!groups) return null
  const byKey = new Map<string, any>()
  groups.forEach(g => (g.statisticsItems ?? []).forEach(item => byKey.set(item.key, item)))

  const turnoversConceded = byKey.get('turnovers')
  const turnoversWon = byKey.get('turnoversWon')
  const penalties = byKey.get('penaltiesConceded')
  if (!turnoversConceded || !turnoversWon || !penalties) return null

  const scrums = byKey.get('scrumsAccuracy')
  const lineouts = byKey.get('lineoutsAccuracy')
  const scrumsHome = parseAccuracy(scrums?.home)
  const scrumsAway = parseAccuracy(scrums?.away)
  const lineoutsHome = parseAccuracy(lineouts?.home)
  const lineoutsAway = parseAccuracy(lineouts?.away)

  return {
    home: {
      scrumsWon: scrumsHome.won, scrumsAttempted: scrumsHome.attempted,
      lineoutsWon: lineoutsHome.won, lineoutsAttempted: lineoutsHome.attempted,
      turnoversWon: Number(turnoversWon.home ?? 0), turnoversConceded: Number(turnoversConceded.home ?? 0),
      penaltiesConceded: Number(penalties.home ?? 0),
    },
    away: {
      scrumsWon: scrumsAway.won, scrumsAttempted: scrumsAway.attempted,
      lineoutsWon: lineoutsAway.won, lineoutsAttempted: lineoutsAway.attempted,
      turnoversWon: Number(turnoversWon.away ?? 0), turnoversConceded: Number(turnoversConceded.away ?? 0),
      penaltiesConceded: Number(penalties.away ?? 0),
    },
  }
}

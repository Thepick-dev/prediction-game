import { createServerSupabaseClient } from '../lib/supabase-server'
import { createAdminSupabaseClient } from '../lib/supabase-admin'
import { pastDeadlineGameweekIds } from '../lib/pastDeadlineGameweeks'
import { requireAdmin } from '../lib/require-admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'

// Every write below goes through this — Server Actions are reachable as
// their own endpoint, not just "the button on a page only admins can see",
// so the page layout's own admin check isn't a guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

// Same reasoning as the nav badge this feeds alongside — several of these
// tables only let a regular session see its own pending row via RLS, not
// everyone's, so this needs the service-role client to count accurately.
// A read-only page load like this one is already gated by app/admin's own
// layout (it's not a separately-invokable Server Action), so no extra
// admin check is needed here beyond that.
async function loadPendingSummary() {
  const admin = createAdminSupabaseClient()
  const pastGwIds = await pastDeadlineGameweekIds(admin)
  const [profiles, resets, usernames, comments, replies, standaloneComments, standaloneReplies] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('approved', false),
    admin.from('password_reset_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('username_change_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    pastGwIds.length > 0
      ? admin.from('picks').select('id', { count: 'exact', head: true }).eq('wall_status', 'pending').not('comments', 'is', null).neq('comments', '').in('gameweek_id', pastGwIds)
      : Promise.resolve({ count: 0 } as { count: number }),
    admin.from('wall_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('wall_comments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('wall_comment_replies').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  return [
    { label: 'Pending user approvals', count: profiles.count ?? 0, href: '/admin/users' },
    { label: 'Password reset requests', count: resets.count ?? 0, href: '/admin/users' },
    { label: 'Username change requests', count: usernames.count ?? 0, href: '/admin/users' },
    { label: 'Wall comments to moderate', count: (comments.count ?? 0) + (standaloneComments.count ?? 0), href: '/admin/wall' },
    { label: 'Wall replies to moderate', count: (replies.count ?? 0) + (standaloneReplies.count ?? 0), href: '/admin/wall' },
  ].filter(item => item.count > 0)
}

// Whether "did the public launch work" is a guess or something you can
// actually look at — isolated and best-effort like everything else new
// this session: a problem computing any one number should just mean that
// card shows zero, never break the rest of the dashboard. Signups come
// from auth.users (every account has a created_at there; profiles doesn't
// necessarily), everything else from tables created this session.
async function loadGrowthStats() {
  const admin = createAdminSupabaseClient()
  const now = Date.now()
  const DAY = 86400000
  const d7 = new Date(now - 7 * DAY).toISOString()
  const d14 = new Date(now - 14 * DAY).toISOString()
  const d30 = new Date(now - 30 * DAY).toISOString()

  let signupsLast7 = 0
  let signupsPrior7 = 0
  let signupsLast30 = 0
  try {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    data?.users?.forEach(u => {
      if (!u.created_at) return
      if (u.created_at >= d7) signupsLast7++
      else if (u.created_at >= d14) signupsPrior7++
      if (u.created_at >= d30) signupsLast30++
    })
  } catch {}

  let codesCreated = 0
  let codesUsed = 0
  try {
    const [{ count: created }, { count: used }] = await Promise.all([
      admin.from('signup_invite_codes').select('id', { count: 'exact', head: true }),
      admin.from('signup_invite_code_uses').select('id', { count: 'exact', head: true }),
    ])
    codesCreated = created ?? 0
    codesUsed = used ?? 0
  } catch {}

  let wallLast7 = 0
  let wallPrior7 = 0
  try {
    const tables = ['wall_comments', 'wall_comment_replies', 'wall_replies']
    const results = await Promise.all(
      tables.flatMap(t => [
        admin.from(t).select('id', { count: 'exact', head: true }).gte('created_at', d7),
        admin.from(t).select('id', { count: 'exact', head: true }).gte('created_at', d14).lt('created_at', d7),
      ])
    )
    results.forEach((r, i) => {
      if (i % 2 === 0) wallLast7 += r.count ?? 0
      else wallPrior7 += r.count ?? 0
    })
  } catch {}

  return { signupsLast7, signupsPrior7, signupsLast30, codesCreated, codesUsed, wallLast7, wallPrior7 }
}

// Blank lines and surrounding whitespace are stripped so a stray Enter key
// doesn't leave an empty gap sitting in the ticker forever. Storing it as
// one newline-separated block (not a separate table) keeps this a single
// textarea to edit, matching how little content this ever needs to hold —
// a handful of short lines, rewritten every so often. Moved here from
// /admin/competitions — that page is for rare season setup, not something
// worth re-visiting weekly just to change a reminder.
async function setFutzySaysText(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  const raw = (formData.get('text') as string) ?? ''
  const cleaned = raw.split('\n').map(line => line.trim()).filter(Boolean).join('\n') || null
  await supabase
    .from('competitions')
    .update({ futzy_says_text: cleaned })
    .eq('id', competitionId)
  redirect('/admin#futzy-says')
}

// Dresses up the whole site for everyone — see SiteThemeEffects.tsx for
// where this actually gets read and rendered. Celebration always needs an
// explicit competition (confirmed with the owner: no auto-picking "most
// recent" — admin chooses, so an old season can be revisited deliberately
// too), so switching away from Celebration clears it rather than leaving a
// stale id sitting around unused.
// Switches which football visual skin every player sees, site-wide.
// Independent of site_theme above (that's seasonal decoration layered on
// top of a skin — a different concept) and of each admin's own personal
// preview override (see app/lib/useSkin.ts) — this is the one value that's
// true for every signed-out visitor and every regular player.
async function setActiveSkin(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const activeSkin = formData.get('active_skin') as string
  const rawVariant = formData.get('pop_art_variant')
  const popArtVariant = rawVariant === 'v2' ? rawVariant : 'v1'
  const rawLoadingAnimation = formData.get('loading_animation')
  const loadingAnimations = ['float', 'pixelate', 'glitch', 'assemble', 'glow']
  const loadingAnimation = loadingAnimations.includes(rawLoadingAnimation as string) ? rawLoadingAnimation : 'float'
  const { error } = await supabase
    .from('site_skin')
    .update({ active_skin: activeSkin, pop_art_variant: popArtVariant, loading_animation: loadingAnimation, updated_at: new Date().toISOString() })
    .eq('id', 'singleton')
  if (error) {
    redirect(`/admin?skinError=${encodeURIComponent(error.message)}#site-skin`)
  }
  redirect('/admin#site-skin')
}

async function setSiteTheme(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const activeTheme = formData.get('active_theme') as string
  const celebrationCompId = (formData.get('celebration_competition_id') as string) || null
  const bonusCardUserId = (formData.get('bonus_card_user_id') as string) || null
  const { error } = await supabase
    .from('site_theme')
    .update({
      active_theme: activeTheme,
      celebration_competition_id: activeTheme === 'celebration' ? celebrationCompId : null,
      bonus_card_user_id: activeTheme === 'bonuscard' ? bonusCardUserId : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'singleton')
  if (error) {
    redirect(`/admin?themeError=${encodeURIComponent(error.message)}#site-theme`)
  }
  redirect('/admin#site-theme')
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ themeError?: string; skinError?: string }> }) {
  const { themeError, skinError } = await searchParams
  const supabase = await createServerSupabaseClient()

  const [{ data: competition }, { data: gameweeks }, { data: entries }, pending, growth] = await Promise.all([
    supabase.from('competitions').select('id, name, status, futzy_says_text').eq('status', 'active').single(),
    supabase.from('gameweeks').select('id, number, status, deadline').order('number', { ascending: false }).limit(5),
    supabase.from('competition_entries').select('id'),
    loadPendingSummary(),
    loadGrowthStats(),
  ])

  // Isolated on purpose — site_theme is a brand new table, not created
  // until the handed-off SQL is run. A missing table shouldn't take the
  // whole dashboard down; the section below just falls back to "Default".
  let siteTheme: { active_theme: string; celebration_competition_id: string | null; bonus_card_user_id: string | null } | null = null
  let completedCompetitions: { id: string; name: string; season: string }[] = []
  try {
    const [{ data: themeRow }, { data: compsData }] = await Promise.all([
      supabase.from('site_theme').select('active_theme, celebration_competition_id, bonus_card_user_id').eq('id', 'singleton').maybeSingle(),
      supabase.from('competitions').select('id, name, season').in('status', ['completed', 'archived']).order('start_date', { ascending: false }),
    ])
    siteTheme = themeRow
    completedCompetitions = compsData ?? []
  } catch {
    // site_theme migration not run yet, or a transient error — the form
    // below just renders with "Default" pre-selected either way.
  }

  // Isolated the same way — site_skin is a brand new table, not created
  // until the handed-off SQL is run. A missing table shouldn't take the
  // whole dashboard down; the section below just falls back to "Pop Art".
  let siteSkin: { active_skin: string; pop_art_variant: string | null } | null = null
  try {
    const { data } = await supabase.from('site_skin').select('active_skin, pop_art_variant').eq('id', 'singleton').maybeSingle()
    siteSkin = data
  } catch {
    // site_skin migration not run yet — the form below just renders with
    // "Pop Art" pre-selected either way.
  }

  // Its own isolated fetch, not bundled into the select above — loading_
  // animation is a newer column than active_skin/pop_art_variant, and
  // Supabase returns data: null for the WHOLE query (not just the missing
  // column) when a selected column doesn't exist yet. Bundling it would
  // have broken the Skin/Variant radios too on a site that hasn't run this
  // migration, not just left the new animation radio unset.
  let loadingAnimation: string | null = null
  try {
    const { data } = await supabase.from('site_skin').select('loading_animation').eq('id', 'singleton').maybeSingle()
    loadingAnimation = data?.loading_animation ?? null
  } catch {
    // Migration not run yet — the form below just renders with "Float"
    // pre-selected either way.
  }

  // Same isolation reasoning — only needed to populate the Bonus Card
  // theme's "which manager" dropdown, so a problem here shouldn't affect
  // anything else on the dashboard either.
  let entrantOptions: { id: string; name: string }[] = []
  if (competition) {
    try {
      const { data: compEntries } = await supabase
        .from('competition_entries')
        .select('user_id')
        .eq('competition_id', competition.id)
        .eq('removed', false)
      const userIds = (compEntries ?? []).map(e => e.user_id)
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, is_bot')
          .in('id', userIds)
        entrantOptions = (profiles ?? [])
          .filter(p => !p.is_bot)
          .map(p => ({ id: p.id, name: p.display_name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      }
    } catch {
      // Non-critical — the dropdown just renders empty.
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>

      {pending.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
          <h2 className="font-bold mb-4 text-red-800">⚠ Needs Your Attention</h2>
          <div className="flex flex-wrap gap-2">
            {pending.map(item => (
              <Link
                key={item.label}
                href={item.href}
                className="bg-white border border-red-200 rounded px-3 py-2 text-sm hover:bg-red-100 flex items-center gap-2"
              >
                <span className="bg-red-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs font-bold">
                  {item.count}
                </span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">📈 Growth</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Signups (7 days)</p>
            <p className="text-2xl font-bold">
              {growth.signupsLast7}
              {growth.signupsLast7 !== growth.signupsPrior7 && (
                <span className={`text-sm ml-1.5 font-normal ${growth.signupsLast7 > growth.signupsPrior7 ? 'text-green-600' : 'text-gray-400'}`}>
                  {growth.signupsLast7 > growth.signupsPrior7 ? '▲' : '▼'} vs {growth.signupsPrior7} the week before
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{growth.signupsLast30} in the last 30 days</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Invite Codes</p>
            <p className="text-2xl font-bold">
              {growth.codesUsed} <span className="text-sm font-normal text-gray-400">used</span>
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {growth.codesCreated} created {growth.codesCreated > 0 ? `(${Math.round((growth.codesUsed / growth.codesCreated) * 100)}% converted)` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Wall Activity (7 days)</p>
            <p className="text-2xl font-bold">
              {growth.wallLast7}
              {growth.wallLast7 !== growth.wallPrior7 && (
                <span className={`text-sm ml-1.5 font-normal ${growth.wallLast7 > growth.wallPrior7 ? 'text-green-600' : 'text-gray-400'}`}>
                  {growth.wallLast7 > growth.wallPrior7 ? '▲' : '▼'} vs {growth.wallPrior7} the week before
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">standalone comments &amp; replies</p>
          </div>
        </div>
      </div>

      {competition && (
        <div id="futzy-says" className="bg-white border rounded-lg p-6 mb-8">
          <h2 className="font-bold mb-1">📢 Futzy Says (ticker)</h2>
          <p className="text-xs text-gray-500 mb-3">
            A scrolling ribbon shown across the top of the site. One line each — reminders, shout-outs, whatever you
            like. Leave it empty to hide the ticker entirely.
          </p>
          <form action={setFutzySaysText}>
            <input type="hidden" name="competition_id" value={competition.id} />
            <textarea
              name="text"
              rows={3}
              defaultValue={competition.futzy_says_text ?? ''}
              placeholder={'Deadline reminder: GW6 locks Friday 6pm\nAdders on a 4-week hot streak'}
              className="border rounded px-2 py-1 text-xs w-full mb-2"
            />
            <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save ticker</button>
          </form>
        </div>
      )}

      <div id="site-theme" className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-1">🎨 Site Theme</h2>
        <p className="text-xs text-gray-500 mb-3">
          Dresses up the whole site for everyone — snow, lights, floating icons, fireworks or confetti depending
          on which, plus matching festive title colours. Celebration also adds a banner announcing a completed
          competition&apos;s top 3 — pick which one below (nothing shows until you choose one).
        </p>
        {themeError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">
            Couldn&apos;t save: {themeError}
          </p>
        )}
        <form action={setSiteTheme} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
            {[
              { value: 'default', label: 'Default' },
              { value: 'christmas', label: '🎄 Christmas' },
              { value: 'easter', label: '🐣 Easter' },
              { value: 'halloween', label: '🎃 Halloween' },
              { value: 'chanukah', label: '🕎 Chanukah' },
              { value: 'diwali', label: '🪔 Diwali' },
              { value: 'eid', label: '🌙 Eid' },
              { value: 'newseason', label: '⚽ New Season' },
              { value: 'bonfire', label: '🎆 Bonfire Night' },
              { value: 'aprilfools', label: '🤡 April Fools' },
              { value: 'valentines', label: '💘 Valentine\'s' },
              { value: 'stpatricks', label: '🍀 St Patrick\'s' },
              { value: 'bonuscard', label: '🃏 Bonus Card' },
              { value: 'celebration', label: '🏆 Celebration' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="active_theme"
                  value={opt.value}
                  defaultChecked={opt.value === 'default' ? (!siteTheme || siteTheme.active_theme === 'default') : siteTheme?.active_theme === opt.value}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Celebrate which competition? (only used when Celebration is selected above)</label>
            <select
              name="celebration_competition_id"
              defaultValue={siteTheme?.celebration_competition_id ?? ''}
              className="border rounded px-2 py-1 text-xs w-full max-w-sm"
            >
              <option value="">— none —</option>
              {completedCompetitions.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.season})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bonus Card scored for which manager? (only used when Bonus Card is selected above — their little photo confetti scatters across the site)</label>
            <select
              name="bonus_card_user_id"
              defaultValue={siteTheme?.bonus_card_user_id ?? ''}
              className="border rounded px-2 py-1 text-xs w-full max-w-sm"
            >
              <option value="">— none —</option>
              {entrantOptions.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save theme</button>
        </form>
      </div>

      <div id="site-skin" className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-1">🕹️ Site Skin</h2>
        <p className="text-xs text-gray-500 mb-3">
          Switches the whole look of the football site (Picks, Leaderboard, Wall, etc. — not the admin section)
          for every player. This is a trial, not a permanent switch — plan is to decide which one wins later in
          the season. You can preview either skin for yourself on the Settings page without changing what anyone
          else sees.
        </p>
        {skinError && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-3">
            Couldn&apos;t save: {skinError}
          </p>
        )}
        <form action={setActiveSkin} className="space-y-3">
          <div className="flex items-center gap-4 text-sm">
            {[
              { value: 'pop-art', label: '🎨 Pop Art' },
              { value: 'retro', label: '🕹️ Retro (16-bit)' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="active_skin"
                  value={opt.value}
                  defaultChecked={opt.value === 'pop-art' ? (!siteSkin || siteSkin.active_skin === 'pop-art') : siteSkin?.active_skin === opt.value}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-4 text-sm border-t pt-3">
            <span className="text-xs text-gray-500">Pop Art version (ignored while Retro is active):</span>
            {[
              { value: 'v1', label: 'V1 (original)' },
              { value: 'v2', label: 'V2 (richer, jewel-toned refinement)' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="pop_art_variant"
                  value={opt.value}
                  defaultChecked={opt.value === 'v1' ? (!siteSkin?.pop_art_variant || siteSkin.pop_art_variant === 'v1') : siteSkin?.pop_art_variant === opt.value}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="text-sm border-t pt-3">
            <p className="text-xs text-gray-500 mb-2">Futzy loading-screen animation (the full-screen mascot shown while a page loads):</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
              {[
                { value: 'float', label: 'Gentle float (default)' },
                { value: 'pixelate', label: 'Pixelate in/out' },
                { value: 'glitch', label: 'Glitch / RGB-split' },
                { value: 'assemble', label: 'Build-up / assemble' },
                { value: 'glow', label: 'Float + pulsing glow' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="loading_animation"
                    value={opt.value}
                    defaultChecked={opt.value === 'float' ? (!loadingAnimation || loadingAnimation === 'float') : loadingAnimation === opt.value}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" className="text-xs bg-black text-white rounded px-2 py-1">Save skin</button>
        </form>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Active Competition</p>
          <p className="font-bold">{competition?.name ?? 'None'}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Players Entered</p>
          <p className="font-bold text-lg">{entries?.length ?? 0}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Latest GW</p>
          <p className="font-bold">{gameweeks?.[0] ? `GW${gameweeks[0].number}` : '—'}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">GW Status</p>
          <p className="font-bold">{gameweeks?.[0]?.status ?? '—'}</p>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6 mb-6">
        <h2 className="font-bold mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Link href="/admin/gameweeks" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Gameweeks</Link>
          <Link href="/admin/fixtures" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Fixtures</Link>
          <Link href="/admin/events" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Events</Link>
          <Link href="/admin/scoring" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Scoring</Link>
          <Link href="/admin/users" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Users</Link>
          <Link href="/admin/picks-log" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Picks Log</Link>
          <Link href="/admin/summary" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Summary</Link>
          <Link href="/admin/sync" className="border rounded px-3 py-2 hover:bg-gray-50 text-center">Sync</Link>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">Recent Gameweeks</h2>
        {(!gameweeks || gameweeks.length === 0) ? (
          <p className="text-gray-400 text-sm">No gameweeks yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2">GW</th>
                <th className="pb-2">Deadline</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {gameweeks.map(gw => (
                <tr key={gw.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">GW{gw.number}</td>
                  <td className="py-2 text-gray-500">
                    {new Date(gw.deadline).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
                    })}
                  </td>
                  <td className="py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      gw.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      gw.status === 'open' ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {gw.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
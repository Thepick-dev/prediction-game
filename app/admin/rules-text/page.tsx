import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
import { RULES_SECTIONS, defaultTextFor } from '../../lib/rulesTextOverrides'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

// Every privileged write below goes through this — Server Actions are
// reachable as their own endpoint, not just "the button on a page only
// admins can see", so the page layout's own admin check isn't a
// guarantee for these.
async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

export default async function RulesTextPage() {
  const supabase = await createServerSupabaseClient()

  // Isolated, defensive — a brand new table; a problem reading it (or the
  // SQL not run yet) just means every section shows its hardcoded default
  // with no override to edit from, same as before this page existed.
  let overrides: { section_key: string; content: string }[] = []
  try {
    const { data } = await supabase.from('rules_text_overrides').select('section_key, content')
    overrides = data ?? []
  } catch {}
  const overrideMap: Record<string, string> = {}
  overrides.forEach(o => { overrideMap[o.section_key] = o.content })

  async function saveSection(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const sectionKey = formData.get('section_key') as string
    const content = (formData.get('content') as string) ?? ''
    await admin.from('rules_text_overrides').upsert({ section_key: sectionKey, content, updated_at: new Date().toISOString() })
    revalidatePath('/', 'layout')
    redirect('/admin/rules-text')
  }

  async function resetSection(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const sectionKey = formData.get('section_key') as string
    await admin.from('rules_text_overrides').delete().eq('section_key', sectionKey)
    revalidatePath('/', 'layout')
    redirect('/admin/rules-text')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Rules Text</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6 max-w-2xl">
        Edit the wording shown on the real Rules page and the Rules preview on the login screen — both read from
        here live, so a save shows up immediately on both. Numbers (banker multiplier, scoring points, etc.) and
        which sections even appear aren&apos;t edited here — those still come from the actual competition settings
        and update automatically regardless of anything below. &quot;Reset to Default&quot; removes your edit and
        goes back to the site&apos;s original wording for that section.
      </p>

      <div className="space-y-6">
        {RULES_SECTIONS.map(section => {
          const hasOverride = section.key in overrideMap
          const currentText = overrideMap[section.key] ?? defaultTextFor(section.key)
          return (
            <div key={section.key} className="bg-white border rounded-lg p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-bold">{section.label}</h2>
                {hasOverride && (
                  <form action={resetSection}>
                    <input type="hidden" name="section_key" value={section.key} />
                    <button type="submit" className="text-xs underline text-gray-500">Reset to Default</button>
                  </form>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-3">
                {section.hint} {hasOverride ? 'Currently showing your edited text.' : 'Currently showing the default text.'}
              </p>
              <form action={saveSection}>
                <input type="hidden" name="section_key" value={section.key} />
                <textarea
                  name="content"
                  defaultValue={currentText}
                  rows={section.key === 'tiebreakers' || section.key === 'scoringIntro' ? 4 : 8}
                  className="w-full border rounded px-3 py-2 text-sm font-mono mb-2"
                />
                <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">Save</button>
              </form>
            </div>
          )
        })}
      </div>
    </div>
  )
}

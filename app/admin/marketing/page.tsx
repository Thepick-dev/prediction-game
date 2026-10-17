import { createServerSupabaseClient } from '../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../lib/supabase-admin'
import { requireAdmin } from '../../lib/require-admin'
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

export default async function MarketingConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: saveError } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: questions } = await supabase
    .from('marketing_consent_questions')
    .select('id, question_text, display_order, active, created_at')
    .order('display_order', { ascending: true })

  async function saveQuestion(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const existingId = formData.get('existing_id') as string
    const question_text = (formData.get('question_text') as string)?.trim()
    const display_order = Number(formData.get('display_order')) || 0

    if (!question_text) {
      redirect('/admin/marketing?error=' + encodeURIComponent('Question text is required'))
    }

    const { error } = existingId
      ? await admin.from('marketing_consent_questions').update({ question_text, display_order }).eq('id', existingId)
      : await admin.from('marketing_consent_questions').insert({ question_text, display_order })

    if (error) redirect('/admin/marketing?error=' + encodeURIComponent(error.message))
    revalidatePath('/', 'layout')
    redirect('/admin/marketing')
  }

  async function toggleActive(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    const active = formData.get('active') === 'true'
    await admin.from('marketing_consent_questions').update({ active: !active }).eq('id', id)
    revalidatePath('/', 'layout')
    redirect('/admin/marketing')
  }

  async function deleteQuestion(formData: FormData) {
    'use server'
    const admin = await requireAdminAction()
    const id = formData.get('id') as string
    // Answers already given stay — they're a historical record of what
    // someone agreed to, same reasoning as never hard-deleting a player's
    // picks; only the question itself (and whether it's still asked) goes.
    await admin.from('marketing_consent_questions').delete().eq('id', id)
    revalidatePath('/', 'layout')
    redirect('/admin/marketing')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Marketing Consent Questions</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6 max-w-2xl">
        Shown as unticked checkboxes on the Join form, and editable any time from Settings. Existing players were
        never retroactively prompted — these only ever appear for someone signing up fresh, or visiting Settings
        themselves. Deactivating a question hides it from new signups and Settings without touching anyone&apos;s
        past answers; deleting it removes the question but keeps the historical answers.
      </p>

      {saveError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-700">{saveError}</div>
      )}

      <div className="bg-white border rounded-lg p-6 mb-8">
        <h2 className="font-bold mb-4">Add a Question</h2>
        <form action={saveQuestion} className="flex items-end gap-3 flex-wrap">
          <div className="flex-1" style={{ minWidth: 240 }}>
            <label className="block text-xs text-gray-500 mb-1">Question text</label>
            <input name="question_text" type="text" placeholder="e.g. Keep me posted about new LMS All-Stars features" className="border rounded px-3 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Order</label>
            <input name="display_order" type="number" defaultValue={(questions?.length ?? 0)} className="border rounded px-3 py-1.5 text-sm w-20" />
          </div>
          <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm">Add</button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6">
        <h2 className="font-bold mb-4">Questions ({questions?.length ?? 0})</h2>
        {!questions || questions.length === 0 ? (
          <p className="text-sm text-gray-400">No marketing consent questions yet — none will be shown until you add one.</p>
        ) : (
          <div className="divide-y">
            {questions.map(q => (
              <div key={q.id} className="flex items-center justify-between py-3 gap-3">
                <form action={saveQuestion} className="flex-1 flex items-end gap-3 flex-wrap">
                  <input type="hidden" name="existing_id" value={q.id} />
                  <input name="question_text" type="text" defaultValue={q.question_text} className="border rounded px-3 py-1.5 text-sm flex-1" style={{ minWidth: 200 }} />
                  <input name="display_order" type="number" defaultValue={q.display_order} className="border rounded px-3 py-1.5 text-sm w-20" />
                  {!q.active && <span className="text-red-500 text-xs uppercase font-bold self-center">Deactivated</span>}
                  <button type="submit" className="text-xs border rounded px-3 py-1.5">Save</button>
                </form>
                <form action={toggleActive}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="active" value={String(q.active)} />
                  <button type="submit" className="text-xs underline text-gray-500">
                    {q.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </form>
                <form action={deleteQuestion}>
                  <input type="hidden" name="id" value={q.id} />
                  <button type="submit" className="text-xs underline text-red-500">Delete</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

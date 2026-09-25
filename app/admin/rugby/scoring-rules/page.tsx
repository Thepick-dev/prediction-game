import { createServerSupabaseClient } from '../../../lib/supabase-server'
import { createAdminSupabaseClient } from '../../../lib/supabase-admin'
import { requireAdmin } from '../../../lib/require-admin'
import { redirect } from 'next/navigation'
import { DEFAULT_RUGBY_SCORING_RULES } from '../../../lib/rugbyScoring'

async function requireAdminAction() {
  const supabase = await createServerSupabaseClient()
  const admin = await requireAdmin(supabase)
  if (!admin) redirect('/')
  return createAdminSupabaseClient()
}

// Every one of these can be switched off entirely by admin, independent of
// its points value — so a category can be paused without losing whatever
// number was configured for it. Deliberately just the "real match action"
// categories, not the structural rules below them (sub budget, ownership
// multiplier) — those aren't things it makes sense to "turn off".
const TOGGLEABLE_RULE_KEYS = new Set([
  'squad_try_points', 'squad_conversion_points', 'squad_penalty_points', 'squad_dropgoal_points', 'squad_red_card_penalty',
  'squad_try_assist_points', 'squad_clean_break_points', 'squad_offload_points', 'squad_meters_run_points',
  'squad_tackle_points', 'squad_tackle_missed_penalty', 'squad_yellow_card_penalty',
])

const RULE_GROUPS: { heading: string; rules: Record<string, string> }[] = [
  {
    heading: 'Dream Team',
    rules: {
      squad_try_points: 'Points per try (any of your 6)',
      squad_conversion_points: 'Points per conversion (kicker only)',
      squad_penalty_points: 'Points per penalty goal (kicker only)',
      squad_dropgoal_points: 'Points per drop goal (kicker only)',
      squad_red_card_penalty: 'Points lost if one of your 6 gets a red card',
      squad_try_assist_points: 'Points per try assist',
      squad_clean_break_points: 'Points per clean break',
      squad_offload_points: 'Points per offload',
      squad_meters_run_points: 'Points per meter run (e.g. 0.05 = 5pts per 100m)',
      squad_tackle_points: 'Points per tackle made',
      squad_tackle_missed_penalty: 'Points lost per tackle missed',
      squad_yellow_card_penalty: 'Points lost per yellow card',
      max_free_subs: 'Free substitutions (per competition, or per round — set by the toggle above)',
      extra_sub_penalty: 'Points lost per substitution beyond the free limit',
      player_ownership_threshold_pct: 'Below this % of managers owning a player, their points get multiplied',
      player_ownership_multiplier: 'The multiplier applied to that rarely-owned player\'s try + kicking points',
    },
  },
  {
    heading: 'Weekly Match Predictions',
    rules: {
      match_win_base: 'Points for correctly picking the winner (before margin is deducted)',
      match_draw_base: 'Points for correctly picking a draw (flat — no margin to be off by)',
      match_confidence_multiplier: 'Multiplier for your one confidence pick each round',
      match_underdog_threshold_pct: 'Below this % of players picking the actual winning side, it counts as an underdog call',
      match_underdog_multiplier: 'Multiplier applied when your correct winner call was an underdog call',
      try_bonus_points: 'Points for correctly calling a team\'s try bonus (4+ tries), per team',
    },
  },
  {
    heading: 'Season Predictions',
    rules: {
      season_underdog_threshold_pct: 'Below this % of players answering correctly, it counts as an underdog answer',
      season_underdog_multiplier: 'Multiplier applied to that question\'s own points for a correct underdog answer',
    },
  },
]
const RULE_LABELS: Record<string, string> = Object.fromEntries(RULE_GROUPS.flatMap(g => Object.entries(g.rules)))

async function saveSubBudgetMode(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  const mode = formData.get('sub_budget_mode') === 'per_round' ? 'per_round' : 'season'
  await supabase.schema('rugby').from('competitions').update({ sub_budget_mode: mode }).eq('id', competitionId)
  redirect('/admin/rugby/scoring-rules')
}

async function saveSquadBudgetCap(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  const raw = (formData.get('squad_budget_cap') as string).trim()
  const cap = raw ? Math.round(Number(raw)) : null
  await supabase.schema('rugby').from('competitions').update({ squad_budget_cap: cap }).eq('id', competitionId)
  redirect('/admin/rugby/scoring-rules')
}

async function saveRules(formData: FormData) {
  'use server'
  const supabase = await requireAdminAction()
  const competitionId = formData.get('competition_id') as string
  const rows = Object.keys(RULE_LABELS).map(key => ({
    competition_id: competitionId,
    rule_key: key,
    points: Number(formData.get(key)),
    enabled: TOGGLEABLE_RULE_KEYS.has(key) ? formData.get(`${key}__enabled`) === 'on' : true,
  }))
  await supabase.schema('rugby').from('scoring_rules').upsert(rows, { onConflict: 'competition_id,rule_key' })
  redirect('/admin/rugby/scoring-rules')
}

export default async function AdminRugbyScoringRulesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: { id: string; name: string } | null }

  if (!competition) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">🏉 Rugby Scoring Rules</h1>
        <p className="text-gray-500 text-sm">No active competition — create and activate one at <a href="/admin/rugby" className="underline">Admin → Rugby</a> first.</p>
      </div>
    )
  }

  const { data: existingRules } = await supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competition.id)
  const valueByKey: Record<string, number> = { ...DEFAULT_RUGBY_SCORING_RULES }
  existingRules?.forEach(r => { valueByKey[r.rule_key] = r.points })

  // Isolated fetch: 'enabled' is a newer, optional column — kept separate
  // so this page still works before the SQL adding it has been run.
  const enabledByKey: Record<string, boolean> = {}
  const { data: enabledRows, error: enabledError } = await supabase.schema('rugby').from('scoring_rules').select('rule_key, enabled').eq('competition_id', competition.id)
  if (!enabledError) enabledRows?.forEach((r: { rule_key: string; enabled: boolean | null }) => { enabledByKey[r.rule_key] = r.enabled !== false })

  // Isolated fetch: 'sub_budget_mode' and 'squad_budget_cap' are newer,
  // optional competitions columns — degrade to 'season' mode / no cap
  // shown if missing.
  const { data: competitionModeRow } = await supabase.schema('rugby').from('competitions').select('sub_budget_mode, squad_budget_cap').eq('id', competition.id).maybeSingle()
  const subBudgetMode = competitionModeRow?.sub_budget_mode === 'per_round' ? 'per_round' : 'season'
  const squadBudgetCap = (competitionModeRow as { squad_budget_cap?: number | null } | null)?.squad_budget_cap ?? null

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🏉 Rugby Scoring Rules</h1>
      <p className="text-gray-500 text-sm mb-6">{competition.name} — these numbers drive every layer of scoring, and update the Rules page automatically. Change them any time; the next &quot;Calculate Points&quot; run always uses whatever&apos;s here.</p>

      <div className="bg-white border rounded-lg p-6 max-w-lg mb-6">
        <h2 className="font-bold text-sm mb-1">Squad budget</h2>
        <p className="text-xs text-gray-500 mb-3">
          The total £ a player can spend across their 6 Dream Team picks. Leave blank for no cap. Player values live
          on <a href="/admin/rugby/players" className="underline">Rugby Players</a> — some are real computed values, some are
          neutral placeholders flagged &quot;estimated&quot; until an admin sets a real one.
        </p>
        <form action={saveSquadBudgetCap} className="flex items-center gap-3">
          <input type="hidden" name="competition_id" value={competition.id} />
          <span>£</span>
          <input type="number" name="squad_budget_cap" step="1" defaultValue={squadBudgetCap ?? ''} placeholder="no cap" className="border rounded px-3 py-2 text-sm flex-1" />
          <button type="submit" className="bg-black text-white rounded px-3 py-1.5 text-sm font-bold">Save</button>
        </form>
      </div>

      <div className="bg-white border rounded-lg p-6 max-w-lg mb-6">
        <h2 className="font-bold text-sm mb-1">Substitution budget</h2>
        <p className="text-xs text-gray-500 mb-3">Whether &quot;Free substitutions&quot; below is a total for the whole competition, or resets fresh every round. Extra subs beyond the free limit always cost the points set below, in either mode.</p>
        <form action={saveSubBudgetMode} className="flex items-center gap-3">
          <input type="hidden" name="competition_id" value={competition.id} />
          <select name="sub_budget_mode" defaultValue={subBudgetMode} className="border rounded px-3 py-2 text-sm">
            <option value="season">Per competition (total, once)</option>
            <option value="per_round">Per round (resets every round)</option>
          </select>
          <button type="submit" className="bg-black text-white rounded px-3 py-1.5 text-sm font-bold">Save</button>
        </form>
      </div>

      <form action={saveRules} className="bg-white border rounded-lg p-6 max-w-lg space-y-6">
        <input type="hidden" name="competition_id" value={competition.id} />
        {RULE_GROUPS.map(group => (
          <div key={group.heading}>
            <h2 className="font-bold text-sm mb-2">{group.heading}</h2>
            <div className="space-y-3">
              {Object.entries(group.rules).map(([key, label]) => (
                <div key={key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium mb-1">{label}</label>
                    <input type="number" name={key} step="any" defaultValue={valueByKey[key]} className="border rounded px-3 py-2 text-sm w-full" />
                  </div>
                  {TOGGLEABLE_RULE_KEYS.has(key) && (
                    <label className="flex items-center gap-1 text-xs text-gray-500 pb-2.5 whitespace-nowrap" title="Untick to switch this category off entirely, without losing the points value above">
                      <input type="checkbox" name={`${key}__enabled`} defaultChecked={enabledByKey[key] !== false} />
                      On
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <button type="submit" className="bg-black text-white rounded px-4 py-2 text-sm font-bold">Save</button>
      </form>
    </div>
  )
}

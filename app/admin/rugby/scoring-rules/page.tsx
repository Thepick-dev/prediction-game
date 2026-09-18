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
      max_free_subs: 'Free substitutions per competition',
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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">🏉 Rugby Scoring Rules</h1>
      <p className="text-gray-500 text-sm mb-6">{competition.name} — these numbers drive every layer of scoring, and update the Rules page automatically. Change them any time; the next &quot;Calculate Points&quot; run always uses whatever&apos;s here.</p>

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

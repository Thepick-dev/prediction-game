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

const RULE_GROUPS: { heading: string; rules: Record<string, string> }[] = [
  {
    heading: 'Your Squad',
    rules: {
      squad_try_points: 'Points per try (any of your 6)',
      squad_conversion_points: 'Points per conversion (kicker only)',
      squad_penalty_points: 'Points per penalty goal (kicker only)',
      squad_dropgoal_points: 'Points per drop goal (kicker only)',
      squad_red_card_penalty: 'Points lost if one of your 6 gets a red card',
      squad_contrarian_bonus: 'Underdog bonus for picking a player few others have',
      max_free_subs: 'Free substitutions per competition',
      extra_sub_penalty: 'Points lost per substitution beyond the free limit',
    },
  },
  {
    heading: 'Weekly Match Predictions',
    rules: {
      winner_bonus: 'Points for picking the correct winner',
      margin_bonus_max: 'Extra points for a spot-on margin (scales down the further off you are)',
      exact_score_bonus: 'Bonus for the exact score',
      match_contrarian_bonus: 'Underdog bonus for backing the side fewer people picked',
      wrong_pick_penalty_constant: 'Points lost per confidence point on a wrong pick',
    },
  },
  {
    heading: 'Season Predictions',
    rules: {
      season_contrarian_bonus: 'Underdog bonus for a correct answer few others gave',
    },
  },
  {
    heading: 'Shared',
    rules: {
      contrarian_threshold_pct: 'Below this % of the field agreeing counts as an underdog pick, anywhere in the game',
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
                <div key={key}>
                  <label className="block text-xs font-medium mb-1">{label}</label>
                  <input type="number" name={key} step="any" defaultValue={valueByKey[key]} className="border rounded px-3 py-2 text-sm w-full" />
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

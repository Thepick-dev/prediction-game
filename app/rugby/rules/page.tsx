import { createServerSupabaseClient } from '../../lib/supabase-server'
import { rulesWithDefaults } from '../../lib/rugbyScoring'

type Competition = { id: string; name: string }
type QuestionType = { label: string; points: number }

export default async function RugbyRulesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  const [{ data: rulesRows }, { data: questionTypes }] = competition
    ? await Promise.all([
        supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competition.id),
        supabase.schema('rugby').from('season_prediction_types').select('label, points').eq('competition_id', competition.id).eq('active', true).order('label') as unknown as Promise<{ data: QuestionType[] | null }>,
      ])
    : [{ data: [] }, { data: [] }]

  const rules = rulesWithDefaults(rulesRows ?? [])
  const questions = questionTypes ?? []

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <h1 className="pop-hero pop-hero--blue text-2xl md:text-3xl mb-1">📖 Rules</h1>
      <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {competition ? `${competition.name} — always the real, current numbers` : 'No active competition yet'}
      </p>

      <div className="space-y-4">
        <section className="pop-panel pop-panel--green p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Your Squad</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Before Round 1&apos;s deadline, pick a squad of six players — exactly one from each of the six nations.
            Mark one of them as your <strong>kicker</strong>.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Your kicker scores <strong>{rules.squad_try_points} points per try</strong>, plus{' '}
            <strong>{rules.squad_conversion_points} per conversion</strong>,{' '}
            <strong>{rules.squad_penalty_points} per penalty goal</strong>, and{' '}
            <strong>{rules.squad_dropgoal_points} per drop goal</strong>. Your other five score{' '}
            <strong>{rules.squad_try_points} points per try</strong> only — no points for kicking.
          </p>
        </section>

        <section className="pop-panel pop-panel--orange p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Kicker &amp; Substitutions</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Changing your kicker is free and unlimited — it&apos;s a separate decision from who&apos;s on your
            squad, so it never touches your substitutions.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            You get <strong>{rules.max_free_subs} free substitutions</strong> for the whole competition (a same-team
            swap only, to keep &quot;one player per team&quot; intact). Beyond that, each extra substitution costs
            you <strong>{rules.extra_sub_penalty} points</strong>.
          </p>
        </section>

        <section className="pop-panel pop-panel--red p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Discipline</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            If one of your six players is shown a red card, you lose <strong>{rules.squad_red_card_penalty} points</strong> that
            round. This can push your round total below zero — it isn&apos;t floored at nothing.
          </p>
        </section>

        <section className="pop-panel pop-panel--pink p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Underdog Bonus</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            If fewer than <strong>{rules.contrarian_threshold_pct}%</strong> of the field also has a player you
            pick, you get a <strong>{rules.squad_contrarian_bonus}-point bonus</strong> — worked out the moment
            they join your squad (draft or substitute), and it sticks regardless of what happens to their
            popularity afterwards. The same idea applies to weekly match predictions (a{' '}
            <strong>{rules.match_contrarian_bonus}-point bonus</strong>) and tournament predictions (a{' '}
            <strong>{rules.season_contrarian_bonus}-point bonus</strong>).
          </p>
        </section>

        <section className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Tournament Predictions</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Before Round 1, you&apos;ll also make a set of one-off predictions about how the whole tournament plays
            out. These lock at the same deadline as your squad and are marked once the tournament finishes.
          </p>
          {questions.length > 0 ? (
            <ul className="text-sm leading-relaxed list-disc pl-5" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {questions.map((q, i) => (
                <li key={i}>{q.label} — {q.points} points</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>No questions set up yet.</p>
          )}
        </section>

        <section className="pop-panel pop-panel--yellow p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Weekly Match Predictions</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Each round, predict the score of all three matches before that round&apos;s deadline. You get{' '}
            <strong>{rules.winner_bonus} points</strong> for the right winner, up to{' '}
            <strong>{rules.margin_bonus_max} more</strong> the closer your margin, and{' '}
            <strong>{rules.exact_score_bonus} extra</strong> for the exact score.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            You also rank your three predictions by confidence (1st/2nd/3rd, no repeats) — a correct pick is
            multiplied by how confident you were, but a wrong pick costs you{' '}
            <strong>{rules.wrong_pick_penalty_constant} points per confidence level</strong> staked. This is the one
            part of the game where a bad call can genuinely cost you, not just miss out.
          </p>
        </section>

        <section className="pop-panel pop-panel--green p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Privacy</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Nobody can see your predictions or squad changes before the relevant deadline passes — same hard rule
            as the football side of this site.
          </p>
        </section>
      </div>
    </div>
  )
}

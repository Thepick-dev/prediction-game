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
        {competition ? competition.name : 'No active competition yet'}
      </p>

      <div className="space-y-4">
        <section className="pop-panel pop-panel--blue p-5">
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            There are three parts to this game — <strong>Tournament Predictions</strong>,{' '}
            <strong>Weekly Match Predictions</strong>, and your <strong>Dream Team</strong>. Every point you earn
            from all three adds up into one total. Whoever has the most points when the tournament ends is crowned
            champion.
          </p>
        </section>

        <section className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Tournament Predictions</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Before Round 1, you&apos;ll make a set of one-off predictions about how the whole tournament plays out.
            These lock at the same deadline as your Dream Team and are marked once the tournament finishes.
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
            Each round, predict the winner (or a draw) and the margin of victory — not the exact score — for all
            three matches before that round&apos;s deadline. A correct winner call scores{' '}
            <strong>{rules.match_win_base} points</strong>, minus 1 point for every point your margin is out by. A
            correctly predicted draw is a flat <strong>{rules.match_draw_base} points</strong> — there&apos;s no
            margin to be off by. Get the winner wrong (including a missed or wrongly-called draw) and you score{' '}
            <strong>zero</strong> for that match — never negative.
          </p>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
            You also pick ONE match each round as your confidence pick, worth{' '}
            <strong>{rules.match_confidence_multiplier}x</strong> on everything you score for it.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            For every match you also call whether EACH team will get a try bonus (4+ tries) — worth{' '}
            <strong>{rules.try_bonus_points} points</strong> per correct call, and it shares that match&apos;s own
            confidence/underdog multiplier.
          </p>
        </section>

        <section className="pop-panel pop-panel--green p-5">
          <h2 className="pop-headline text-sm mb-3" style={{ color: 'var(--pop-white)' }}>Dream Team</h2>

          <h3 className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--pop-green)' }}>Your Squad</h3>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Before Round 1&apos;s deadline, pick a squad of six players — exactly one from each of the six nations.
            Mark one of them as your <strong>kicker</strong>. Your kicker scores{' '}
            <strong>{rules.squad_try_points} points per try</strong>, plus{' '}
            <strong>{rules.squad_conversion_points} per conversion</strong>,{' '}
            <strong>{rules.squad_penalty_points} per penalty goal</strong>, and{' '}
            <strong>{rules.squad_dropgoal_points} per drop goal</strong>. Your other five score{' '}
            <strong>{rules.squad_try_points} points per try</strong> only — no points for kicking.
          </p>

          <h3 className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--pop-green)' }}>Kicker &amp; Substitutions</h3>
          <p className="text-sm leading-relaxed mb-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Changing your kicker is free and unlimited — it&apos;s a separate decision from who&apos;s on your
            Dream Team, so it never touches your substitutions.
          </p>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>
            You get <strong>{rules.max_free_subs} free substitutions</strong> for the whole competition (a same-team
            swap only, to keep &quot;one player per team&quot; intact). Beyond that, each extra substitution costs
            you <strong>{rules.extra_sub_penalty} points</strong>.
          </p>

          <h3 className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--pop-green)' }}>Discipline</h3>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            If one of your six players is shown a red card, you lose <strong>{rules.squad_red_card_penalty} points</strong> that
            round. This can push your round total below zero — it isn&apos;t floored at nothing.
          </p>
        </section>

        <section className="pop-panel pop-panel--pink p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Underdog Multipliers</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Picking rarely-picked options is rewarded everywhere in this game, always the same way — your points
            for that pick get multiplied, they&apos;re never just topped up with a flat bonus.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Dream Team: if fewer than <strong>{rules.player_ownership_threshold_pct}%</strong> of managers also hold a
            player you pick, their try + kicking points that round are multiplied by{' '}
            <strong>{rules.player_ownership_multiplier}x</strong> — worked out the moment they join your squad
            (draft or substitute), and it sticks regardless of their popularity afterwards. Match predictions: if
            fewer than <strong>{rules.match_underdog_threshold_pct}%</strong> of players picked the winning side you
            backed, your points for that match are multiplied by <strong>{rules.match_underdog_multiplier}x</strong>.
            Tournament predictions: a correct answer fewer than{' '}
            <strong>{rules.season_underdog_threshold_pct}%</strong> of players also got right is multiplied by{' '}
            <strong>{rules.season_underdog_multiplier}x</strong>.
          </p>
        </section>

        <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Every pick here — your Dream Team, tournament predictions, and each round&apos;s match predictions — can
          be freely changed as many times as you like right up until its own deadline. Nothing locks in early.
        </p>

        <section className="pop-panel pop-panel--blue p-5">
          <h2 className="pop-headline text-sm mb-2" style={{ color: 'var(--pop-white)' }}>Privacy</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Nobody can see your predictions or Dream Team changes before the relevant deadline passes.
          </p>
        </section>
      </div>
    </div>
  )
}

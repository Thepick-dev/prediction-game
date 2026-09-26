import { createServerSupabaseClient } from '../../lib/supabase-server'
import { rulesWithDefaults } from '../../lib/rugbyScoring'

type Competition = { id: string; name: string }

export default async function RugbyRulesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: competition } = await supabase.schema('rugby').from('competitions').select('id, name').eq('status', 'active').maybeSingle() as unknown as { data: Competition | null }

  const { data: rulesRows } = competition
    ? await supabase.schema('rugby').from('scoring_rules').select('rule_key, points').eq('competition_id', competition.id)
    : { data: [] }

  const rules = rulesWithDefaults(rulesRows ?? [])

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6">
      <div className="rugby-hero-wrap">
        <p className="rugby-hero-eyebrow">{competition ? competition.name : 'No active competition yet'}</p>
        <h1 className="rugby-hero-title">Rules</h1>
      </div>

      <div className="space-y-4">
        <section className="rugby-panel p-5">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            There are two parts to this game — <strong style={{ color: 'var(--rugby-text)' }}>Weekly Match Predictions</strong>, and your{' '}
            <strong style={{ color: 'var(--rugby-text)' }}>Dream Team</strong>. Every point you earn from both adds up into one total. Whoever has the
            most points when the tournament ends is crowned champion.
          </p>
        </section>

        <section className="rugby-panel p-5">
          <h2 className="rugby-cond text-sm mb-2 uppercase tracking-wide">Weekly Match Predictions</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            Each round, predict the winner (or a draw) and the margin of victory — not the exact score — for all
            three matches before that round&apos;s deadline. A correct winner call scores{' '}
            <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_win_base} points</strong>, minus 1 point for every point your margin is out by. A
            correctly predicted draw is a flat <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_draw_base} points</strong> — there&apos;s no
            margin to be off by. Get the winner wrong (including a missed or wrongly-called draw) and you score{' '}
            <strong style={{ color: 'var(--rugby-text)' }}>zero</strong> for that match — never negative.
          </p>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            You also pick ONE match each round as your confidence pick, worth{' '}
            <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_confidence_multiplier}x</strong> on everything you score for it.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            For every match you also call whether EACH team will get a try bonus (4+ tries) — worth{' '}
            <strong style={{ color: 'var(--rugby-text)' }}>{rules.try_bonus_points} points</strong> per correct call, and it shares that match&apos;s own
            confidence/underdog multiplier.
          </p>
        </section>

        <section className="rugby-panel p-5">
          <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Dream Team</h2>

          <h3 className="rugby-cond text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--rugby-floodlight)' }}>Your Squad</h3>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--rugby-text-dim)' }}>
            Before Round 1&apos;s deadline, pick a squad of six players — at most two from any one nation — within
            your budget.
          </p>

          <h3 className="rugby-cond text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--rugby-floodlight)' }}>Scoring</h3>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--rugby-text-dim)' }}>
            Each of your six players is scored on their whole performance in their match that round — tries,
            tackles, carries, kicking, defence and discipline all feed into one rating out of 100 for that game.
            Your squad&apos;s round total is the sum of your six players&apos; ratings, scaled by{' '}
            <strong style={{ color: 'var(--rugby-text)' }}>{rules.squad_rating_multiplier}</strong>. A red or yellow card already pulls a player&apos;s own
            rating down — there&apos;s no separate penalty stacked on top.
          </p>

          <h3 className="rugby-cond text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--rugby-floodlight)' }}>Substitutions</h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            You get <strong style={{ color: 'var(--rugby-text)' }}>{rules.max_free_subs} free substitutions</strong> for the whole competition (a same-team
            swap only, to keep the 2-per-team limit intact). Beyond that, each extra substitution costs
            you <strong style={{ color: 'var(--rugby-text)' }}>{rules.extra_sub_penalty} points</strong>.
          </p>
        </section>

        <section className="rugby-panel p-5">
          <h2 className="rugby-cond text-sm mb-2 uppercase tracking-wide">How Player Ratings Work</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            A rating out of 100 isn&apos;t a fixed mark — it&apos;s <strong style={{ color: 'var(--rugby-text)' }}>how that game compared to every other
            performance we&apos;ve recorded at the same position</strong>. 50 means a typical game for that position; 90+ means one of the best anyone in
            that position has had. A prop and a winger are never compared to each other directly — only to other props, or other wingers.
          </p>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            A player&apos;s overall rating (and the £ value that comes from it) blends their recent games — the further back a game is, the less it
            counts, so current form always matters most.
          </p>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            A yellow or red card meaningfully hurts a player&apos;s rating for that game — how much depends on their position, since a quiet game
            naturally looks different for a prop than for a winger.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            We also pull in performances from outside the Six Nations — players&apos; club form, and other international rugby — to build a fuller
            picture. International rugby is tougher than club rugby, so it counts for more; and a player who&apos;s never played international rugby
            has their rating held below the very top, however good their club form looks, until they get the chance to prove it at that level.
          </p>
        </section>

        <section className="rugby-panel rugby-panel--gold p-5">
          <h2 className="rugby-cond text-sm mb-2 uppercase tracking-wide">Underdog Multipliers</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            Picking rarely-picked options is rewarded everywhere in this game, always the same way — your points
            for that pick get multiplied, they&apos;re never just topped up with a flat bonus.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            Dream Team: if fewer than <strong style={{ color: 'var(--rugby-text)' }}>{rules.player_ownership_threshold_pct}%</strong> of managers also hold a
            player you pick, their rating points that round are multiplied by{' '}
            <strong style={{ color: 'var(--rugby-text)' }}>{rules.player_ownership_multiplier}x</strong> — worked out the moment they join your squad
            (draft or substitute), and it sticks regardless of their popularity afterwards. Match predictions: if
            fewer than <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_underdog_threshold_pct}%</strong> of players picked the winning side you
            backed, your points for that match are multiplied by <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_underdog_multiplier}x</strong>.
          </p>
        </section>

        <p className="text-xs text-center" style={{ color: 'var(--rugby-text-faint)' }}>
          Every pick here — your Dream Team and each round&apos;s match predictions — can be freely changed as many
          times as you like right up until its own deadline. Nothing locks in early.
        </p>

        <section className="rugby-panel p-5">
          <h2 className="rugby-cond text-sm mb-2 uppercase tracking-wide">Privacy</h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            Nobody can see your predictions or Dream Team changes before the relevant deadline passes.
          </p>
        </section>
      </div>
    </div>
  )
}

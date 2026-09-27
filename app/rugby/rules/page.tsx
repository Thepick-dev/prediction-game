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
            three matches before that round&apos;s deadline.
          </p>
          <ul className="text-sm leading-relaxed space-y-1.5 mb-2 list-disc pl-4" style={{ color: 'var(--rugby-text-dim)' }}>
            <li>Calling the right winner is always worth <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_winner_points} points</strong>, however wrong your margin guess is.</li>
            <li>A spot-on margin adds up to <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_margin_max_points} more</strong> on top of that, losing <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_margin_penalty_per_point} point{rules.match_margin_penalty_per_point === 1 ? '' : 's'}</strong> for every point you&apos;re out by (never below 0 on its own).</li>
            <li>A correctly predicted draw is a flat <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_draw_base} points</strong> instead — there&apos;s no margin to be off by.</li>
            <li>Get the winner wrong (including a missed or wrongly-called draw) and you score <strong style={{ color: 'var(--rugby-text)' }}>zero</strong> for that match — never negative.</li>
          </ul>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            Two multipliers can then apply on top of whatever you scored above:
          </p>
          <ul className="text-sm leading-relaxed space-y-1.5 list-disc pl-4" style={{ color: 'var(--rugby-text-dim)' }}>
            <li>You pick <strong style={{ color: 'var(--rugby-text)' }}>one match each round</strong> as your confidence pick, worth <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_confidence_multiplier}x</strong> on everything you score for it.</li>
            <li>Picking the <strong style={{ color: 'var(--rugby-text)' }}>underdog</strong> is rewarded on a sliding scale: at <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_underdog_threshold_pct}%</strong> or more of the field backing the winning side, there&apos;s no bonus; below that, the fewer people who picked it, the bigger your multiplier, ramping up to <strong style={{ color: 'var(--rugby-text)' }}>{rules.match_underdog_max_multiplier}x</strong> if literally nobody else picked it. Both multipliers combine additively if a confidence pick also happens to be an underdog.</li>
          </ul>
        </section>

        <section className="rugby-panel p-5">
          <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Dream Team</h2>

          <h3 className="rugby-cond text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--rugby-floodlight)' }}>Your Squad</h3>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--rugby-text-dim)' }}>
            Before Round 1&apos;s deadline, pick a squad of six players — at most two from any one nation — within
            your budget, and name one of them <strong style={{ color: 'var(--rugby-text)' }}>captain</strong>.
          </p>

          <h3 className="rugby-cond text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--rugby-floodlight)' }}>Scoring</h3>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            Each of your six players is scored on their whole performance in their match that round — tries,
            tackles, carries, defence and discipline all feed into one rating out of 100 for that game (a red or
            yellow card already pulls this down, there&apos;s no separate penalty stacked on top). Your squad&apos;s
            round total is the sum of your six players&apos; ratings, scaled by <strong style={{ color: 'var(--rugby-text)' }}>{rules.squad_rating_multiplier}</strong>.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            Two multipliers can then apply, per player, per round:
          </p>
          <ul className="text-sm leading-relaxed space-y-1.5 list-disc pl-4" style={{ color: 'var(--rugby-text-dim)' }}>
            <li>Your <strong style={{ color: 'var(--rugby-text)' }}>captain</strong> scores <strong style={{ color: 'var(--rugby-text)' }}>{rules.captain_multiplier}x</strong>, every round they&apos;re captain.</li>
            <li>A player owned by fewer than <strong style={{ color: 'var(--rugby-text)' }}>{rules.player_ownership_threshold_pct}%</strong> of managers scores <strong style={{ color: 'var(--rugby-text)' }}>{rules.player_ownership_multiplier}x</strong> on their points — worked out the moment they join your squad (draft or substitute), and it sticks regardless of their popularity afterwards.</li>
          </ul>

          <h3 className="rugby-cond text-xs uppercase tracking-wide mb-1.5 mt-3" style={{ color: 'var(--rugby-floodlight)' }}>Captain changes</h3>
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--rugby-text-dim)' }}>
            Your first change of captain (after the initial pick) is free. Every change after that costs you{' '}
            <strong style={{ color: 'var(--rugby-text)' }}>{rules.captain_change_penalty} points</strong>, charged the round the change is made.
          </p>

          <h3 className="rugby-cond text-xs uppercase tracking-wide mb-1.5" style={{ color: 'var(--rugby-floodlight)' }}>Substitutions</h3>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            You get <strong style={{ color: 'var(--rugby-text)' }}>{rules.max_free_subs} free substitutions</strong> for the whole competition (a same-team
            swap only, to keep the 2-per-team limit intact). Beyond that, each extra substitution costs
            you <strong style={{ color: 'var(--rugby-text)' }}>{rules.extra_sub_penalty} points</strong>.
          </p>
        </section>

        <section className="rugby-panel p-5">
          <h2 className="rugby-cond text-sm mb-3 uppercase tracking-wide">Picking a Good Dream Team Squad</h2>
          <ul className="text-sm leading-relaxed space-y-2.5" style={{ color: 'var(--rugby-text-dim)' }}>
            <li>
              <strong style={{ color: 'var(--rugby-text)' }}>Your total is a sum, not a top score.</strong> All six players&apos; ratings get added
              together, so one big star can&apos;t carry five weak links. Spreading your budget across six genuinely solid picks beats blowing it on
              two superstars and filling the rest with the cheapest names available.
            </li>
            <li>
              <strong style={{ color: 'var(--rugby-text)' }}>Proven internationals have no ceiling — fringe players do.</strong> Someone with a
              real run of caps behind them can rate as high as their game deserves. Someone uncapped or barely-capped is cheaper for a reason:
              however well they play, their rating&apos;s held back until they&apos;ve proven it at Test level. A promising rookie is a lower-floor,
              lower-ceiling pick, not a hidden bargain.
            </li>
            <li>
              <strong style={{ color: 'var(--rugby-text)' }}>Form is current, not permanent.</strong> Recent games count for more than old ones, so
              a slow start doesn&apos;t define a player all tournament, and someone hitting form right now shows it in their rating quickly. Worth
              checking who&apos;s trending up before a deadline, not just who&apos;s cheap.
            </li>
            <li>
              <strong style={{ color: 'var(--rugby-text)' }}>Different positions score differently.</strong> Wingers and full-backs live and die on
              tries and breaks — high ceiling, less consistent. Front-row forwards score more off sheer workrate and their team&apos;s set-piece — a
              steadier floor, rarely a huge round. A squad of six boom-or-bust backs is a riskier bet than mixing in a couple of reliable forwards.
            </li>
            <li>
              <strong style={{ color: 'var(--rugby-text)' }}>The team matters too, not just the player.</strong> A win nudges every one of that
              team&apos;s players&apos; ratings up a little; a loss nudges them down. For forwards specifically, their own team&apos;s scrum and
              lineout performance that match feeds into their rating as well. A strong side having a good day lifts everyone in it slightly.
            </li>
            <li>
              <strong style={{ color: 'var(--rugby-text)' }}>Being different from the crowd pays off</strong> — see the ownership multiplier above.
              Two similarly-good players aren&apos;t equal picks if one&apos;s owned by everyone and the other isn&apos;t.
            </li>
            <li>
              <strong style={{ color: 'var(--rugby-text)' }}>Save your free substitutions.</strong> You only get {rules.max_free_subs} for the
              whole competition. Chasing this week&apos;s form with a swap feels good, but an injury or a rough run of fixtures later in the
              tournament is when a free sub is worth the most.
            </li>
          </ul>
        </section>

        <section className="rugby-panel p-5">
          <h2 className="rugby-cond text-sm mb-2 uppercase tracking-wide">How the Power Ranking (and £ Value) Works</h2>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            A rating out of 100 isn&apos;t a fixed mark — it&apos;s <strong style={{ color: 'var(--rugby-text)' }}>how that game compared to every other
            performance we&apos;ve recorded at the same position</strong>. 50 means a typical game for that position; 90+ means one of the best anyone in
            that position has had. A prop and a winger are never compared to each other directly — only to other props, or other wingers. A
            substitute&apos;s performance is compared to other substitutes, not to someone who played the full 80 minutes, since fewer minutes
            naturally means fewer tackles/carries/metres to rack up.
          </p>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            A player&apos;s <strong style={{ color: 'var(--rugby-text)' }}>Power Ranking</strong> blends their recent games — the further back a game
            is, the less it counts, so current form always matters most. It&apos;s not a plain average: a handicap for a short track record means
            one or two standout games nudges the ranking up rather than defining it outright, until there&apos;s a real body of games behind it.
            A yellow or red card meaningfully hurts a player&apos;s rating for that game too — how much depends on their position, since a quiet
            game naturally looks different for a prop than for a winger.
          </p>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--rugby-text-dim)' }}>
            We also pull in performances from outside the Six Nations — players&apos; club form, and other international rugby — to build a fuller
            picture. International rugby is tougher than club rugby, so it counts for more, and a player with no real international caps has
            their rating held well below the top regardless of club form, until they&apos;ve got a genuine run of appearances behind them.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--rugby-text-dim)' }}>
            <strong style={{ color: 'var(--rugby-text)' }}>£ value is deliberately steep, not a straight readout of the ranking</strong> — the very
            best in the game cost close to the maximum, a solidly-good player costs a lot less, and an unproven one is a bargain. That&apos;s what
            makes the budget a real decision rather than a formality — you genuinely can&apos;t just draft the six best players in the game.
          </p>
        </section>

        <section className="rugby-panel p-5">
          <h2 className="rugby-cond text-sm mb-2 uppercase tracking-wide">A Couple More Things</h2>
          <ul className="text-sm leading-relaxed space-y-1.5 list-disc pl-4" style={{ color: 'var(--rugby-text-dim)' }}>
            <li>Every pick here — your Dream Team and each round&apos;s match predictions — can be freely changed as many times as you like right up until its own deadline. Nothing locks in early.</li>
            <li>Nobody can see your predictions or Dream Team changes before the relevant deadline passes.</li>
          </ul>
        </section>
      </div>
    </div>
  )
}

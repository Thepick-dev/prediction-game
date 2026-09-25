'use client'

// Toggle button used everywhere in the picks flow for a binary/ternary
// choice — bold, filled when active, plenty of touch target, no small
// print. The one shared visual language behind winner picks, try-bonus
// calls, and the confidence pick, so the whole flow reads as one game,
// not several forms bolted together.
export default function ChoiceButton({ label, active, fill, text, onClick }: { label: string; active: boolean; fill: string; text: string; onClick: () => void }) {
  // Even unselected, every choice carries a visible tint of its own team
  // colour — a wall of identical grey boxes was exactly the "haven't
  // leant into the theme" problem. Only the active state goes to a full
  // fill; everything else still reads as belonging to its team at a
  // glance, not just after you've clicked it.
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rugby-choice-btn ${active ? 'rugby-choice-btn--active' : ''} rugby-cond uppercase tracking-wide w-full py-3 px-2 text-sm text-center`}
      style={{
        background: active ? fill : `linear-gradient(135deg, var(--rugby-ink-3), ${fill}2e)`,
        color: active ? text : 'var(--rugby-text)',
        border: active ? `2px solid ${fill}` : `2px solid ${fill}70`,
        boxShadow: active ? `0 6px 18px ${fill}66` : `0 0 12px ${fill}22`,
        fontWeight: active ? 900 : 700,
        letterSpacing: '0.05em',
      }}
    >
      {label}
    </button>
  )
}

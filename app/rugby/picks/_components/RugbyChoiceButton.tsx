'use client'

// Bold clear and emphatic (Kit, 2026-09-25): outline-on-white when
// unselected — still visibly tinted in that choice's own colour, never a
// flat grey box — solid fill with white text once picked. High contrast
// either way, readable at a glance.
export default function ChoiceButton({ label, active, fill, text, onClick }: { label: string; active: boolean; fill: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rb2-choice w-full py-4 px-2 text-base"
      style={{
        background: active ? fill : '#ffffff',
        color: active ? text : fill,
        border: `3px solid ${fill}`,
        boxShadow: active ? `4px 4px 0 var(--rb2-ink)` : `3px 3px 0 ${fill}55`,
        fontWeight: 800,
      }}
    >
      {label}
    </button>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

export type PopSelectOption = { value: string; label: React.ReactNode }

// A genuinely custom dropdown, not a CSS-skinned native <select> — even a
// heavily restyled native select still opens the browser/OS's own option
// list when clicked (that part of a <select> isn't reachable by CSS in
// any mainstream browser), which is exactly the "generic dropdown menu"
// look this exists to replace. The closed trigger reuses .pop-input for
// visual consistency with every other input on the page; the open list
// is a real .pop-panel so it's genuinely in the site's own style.
export default function PopSelect({
  value, onChange, options, className = '', placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: PopSelectOption[]
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const idx = options.findIndex(o => o.value === value)
    setHighlighted(idx >= 0 ? idx : 0)
  }, [open, value, options])

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = options[highlighted]
      if (opt) { onChange(opt.value); setOpen(false) }
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleTriggerKeyDown}
        className="pop-input w-full px-3 py-2 text-sm font-bold uppercase flex items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label ?? placeholder ?? 'Select...'}</span>
        <span
          className="shrink-0"
          style={{ fontSize: '10px', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }}
        >
          ▼
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="pop-panel absolute left-0 right-0 mt-1 overflow-y-auto"
          style={{ zIndex: 60, maxHeight: 280, padding: 4 }}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className="px-3 py-2 rounded-lg text-sm font-bold uppercase cursor-pointer"
                style={{
                  background: isSelected ? 'var(--pop-green)' : i === highlighted ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: isSelected ? 'var(--pop-black)' : 'var(--pop-white)',
                }}
              >
                {opt.label}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

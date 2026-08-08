'use client'

import { useState } from 'react'

// Same two-step "are you sure" pattern as ConfirmDeleteButton, but for
// actions that need a pause before running without being a deletion —
// styled neutrally rather than red, and every label is caller-supplied
// rather than hardcoded to "delete".
export default function ConfirmActionButton({
  action,
  hiddenFields,
  label,
  confirmText,
  confirmLabel = 'Yes, continue',
  className = 'text-xs bg-black text-white rounded px-2 py-1',
}: {
  action: (formData: FormData) => void
  hiddenFields: Record<string, string>
  label: string
  confirmText: string
  confirmLabel?: string
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <form action={action} className="flex items-center gap-1 flex-wrap">
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <span className="text-xs text-gray-600 font-medium mr-1">{confirmText}</span>
        <button type="submit" className={className}>
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-xs bg-gray-200 text-gray-700 rounded px-2 py-1"
        >
          Cancel
        </button>
      </form>
    )
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className={className}>
      {label}
    </button>
  )
}

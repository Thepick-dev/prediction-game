'use client'

import { useState } from 'react'

export default function ConfirmDeleteButton({
  action,
  hiddenFields,
  label = 'Delete',
  confirmText = 'Are you sure you want to delete this?'
}: {
  action: (formData: FormData) => void
  hiddenFields: Record<string, string>
  label?: string
  confirmText?: string
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <form action={action} className="flex items-center gap-1">
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <span className="text-xs text-red-600 font-medium mr-1">{confirmText}</span>
        <button
          type="submit"
          className="text-xs bg-red-600 text-white rounded px-2 py-1"
        >
          Yes, delete
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
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs bg-red-600 text-white rounded px-2 py-1"
    >
      {label}
    </button>
  )
}
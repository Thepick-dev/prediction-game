'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-black text-white rounded px-4 py-2 text-sm shrink-0 print:hidden"
    >
      Print / Save as PDF
    </button>
  )
}

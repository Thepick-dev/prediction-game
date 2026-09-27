'use client'

import { useFormStatus } from 'react-dom'

// A real pull can take anywhere from a couple of seconds to well over a
// minute (rate-limited to 10 requests/minute against the real API), and
// the plain <button> here previously gave zero feedback while that ran.
// Confirmed live: if the tab is closed or navigated away mid-request,
// the in-progress work (e.g. last_pulled_round) can already be saved
// while the final summary/timestamp never gets written — indistinguishable
// from "the button did nothing" unless the button visibly says to wait.
export default function PullButton({ children, pendingText, disabled, className }: { children: React.ReactNode; pendingText: string; disabled?: boolean; className?: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={disabled || pending} className={className}>
      {pending ? pendingText : children}
    </button>
  )
}

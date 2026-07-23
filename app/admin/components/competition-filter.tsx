'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export default function CompetitionFilter({ competitions }: { competitions: { id: string; name: string }[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('competition_id') ?? ''

  return (
    <select
      value={current}
      onChange={e => {
        const value = e.target.value
        router.push(value ? `/admin/gameweeks?competition_id=${value}` : '/admin/gameweeks')
      }}
      className="border rounded px-3 py-2 text-sm"
    >
      <option value="">All competitions</option>
      {competitions.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )
}

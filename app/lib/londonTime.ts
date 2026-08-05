// A `datetime-local` input's value ("YYYY-MM-DDTHH:mm") carries no timezone
// info at all — it's just the literal digits an admin typed, meant as UK
// wall-clock time. Passed straight to Supabase, that naive string gets
// stored as if it were UTC, so every deadline entered while the UK is on
// BST (UTC+1) lands an hour early. These two functions are the correct
// round-trip: convert the admin's London wall-clock input to the right UTC
// instant before saving, and convert a stored UTC deadline back to the
// London wall-clock value before showing it in an edit form — both aware of
// the GMT/BST boundary via the Europe/London IANA zone, not a fixed offset.

function londonOffsetMs(instant: Date): number {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = fmt.formatToParts(instant).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {} as Record<string, string>)
  const asIfUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  return asIfUtc - instant.getTime()
}

export function londonInputToUtcISOString(localDateTimeStr: string): string {
  const guessUtc = new Date(localDateTimeStr + 'Z')
  const offset = londonOffsetMs(guessUtc)
  return new Date(guessUtc.getTime() - offset).toISOString()
}

export function utcToLondonInputValue(isoString: string): string {
  const instant = new Date(isoString)
  const offset = londonOffsetMs(instant)
  return new Date(instant.getTime() + offset).toISOString().slice(0, 16)
}

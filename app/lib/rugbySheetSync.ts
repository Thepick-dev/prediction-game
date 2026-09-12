import ExcelJS from 'exceljs'

// Pure parsing — no DB access, no filesystem access. Takes whatever bytes
// the caller already read from public/rugby-data.xlsx and turns them into
// plain typed rows. Kept separate from the actual sync (in the API route)
// so this half can be tested/reasoned about without a real database.

export type SquadRow = { team: string; playerName: string }
export type FixtureRow = { round: number; homeTeam: string; awayTeam: string; kickoff: Date | null }
export type ResultRow = { round: number; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number }
export type ScorerRow = { round: number; homeTeam: string; awayTeam: string; player: string; eventType: string; minute: number | null }

export type ParsedRugbyWorkbook = {
  squads: SquadRow[]
  fixtures: FixtureRow[]
  results: ResultRow[]
  scorers: ScorerRow[]
}

function cellText(cell: ExcelJS.Cell): string | null {
  const v = cell.value
  if (v == null) return null
  if (typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text).trim() || null
  const s = String(v).trim()
  return s || null
}

function cellNumber(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function cellDate(cell: ExcelJS.Cell): Date | null {
  const v = cell.value
  if (v instanceof Date) return v
  return null
}

// Reads rows starting at row 2 (row 1 is always the header), stopping at
// the first row with nothing in column A — matches how the template's
// tabs are laid out (contiguous rows, no gaps expected).
function eachDataRow(sheet: ExcelJS.Worksheet, fn: (row: ExcelJS.Row) => void) {
  let r = 2
  while (true) {
    const row = sheet.getRow(r)
    if (!row.getCell(1).value) break
    fn(row)
    r++
  }
}

export async function parseRugbyWorkbook(buffer: Buffer): Promise<ParsedRugbyWorkbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)

  const squads: SquadRow[] = []
  const squadsSheet = wb.getWorksheet('Squads')
  if (squadsSheet) {
    eachDataRow(squadsSheet, row => {
      const team = cellText(row.getCell(1))
      const playerName = cellText(row.getCell(2))
      if (!team || !playerName) return
      squads.push({ team, playerName })
    })
  }

  // The Fixtures tab is now the single place for schedule, results, AND
  // scorers — one row is either just the match's schedule info, a result,
  // a scoring event, or any combination, entirely up to how the admin
  // chooses to lay it out (all on one row, or spread across several for
  // the same match). Every row that names a round/home/away contributes a
  // FixtureRow (even with a null kickoff) so the match is registered
  // regardless of which columns happen to be filled in on it.
  const fixtures: FixtureRow[] = []
  const results: ResultRow[] = []
  const scorers: ScorerRow[] = []
  const fixturesSheet = wb.getWorksheet('Fixtures')
  if (fixturesSheet) {
    eachDataRow(fixturesSheet, row => {
      const round = cellNumber(row.getCell(1))
      const homeTeam = cellText(row.getCell(2))
      const awayTeam = cellText(row.getCell(3))
      if (!round || !homeTeam || !awayTeam) return

      fixtures.push({ round, homeTeam, awayTeam, kickoff: cellDate(row.getCell(4)) })

      const homeScore = cellNumber(row.getCell(5))
      const awayScore = cellNumber(row.getCell(6))
      if (homeScore != null && awayScore != null) {
        results.push({ round, homeTeam, awayTeam, homeScore, awayScore })
      }

      const player = cellText(row.getCell(7))
      const eventType = cellText(row.getCell(8))
      if (player && eventType) {
        scorers.push({ round, homeTeam, awayTeam, player, eventType, minute: cellNumber(row.getCell(9)) })
      }
    })
  }

  return { squads, fixtures, results, scorers }
}

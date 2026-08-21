'use client'

import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import PrintButton from '../components/print-button'

export type GwColumn = { id: string; number: number; revealed: boolean }

export type GridCell = {
  team: string
  isBanker: boolean
  player1Name: string
  player2Name: string
  teamPoints: number | null
  player1Points: number | null
  player2Points: number | null
  aon: { onPlayer1: boolean; outcome: 'pending' | 'success' | 'failed' } | null
  bonusCard: { playerName: string; points: number | null } | null
  gwTotal: number | null
}

export type PlayerRow = { id: string; name: string; cells: Record<string, GridCell> }

type Props = {
  competitionName: string
  bonusCardName: string
  gwColumns: GwColumn[]
  playerRows: PlayerRow[]
}

const aonStyle = { pending: '#A000FA', success: '#CCFA00', failed: '#FA003C' } as const
const aonLabel = { pending: 'AoN', success: 'AoN ✓', failed: 'AoN ✕' } as const

export default function PrintGridView({ competitionName, bonusCardName, gwColumns, playerRows }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  async function handleShare() {
    if (!gridRef.current) return
    setSharing(true)
    setShareError(null)
    try {
      const dataUrl = await toPng(gridRef.current, { pixelRatio: 1.5, backgroundColor: '#0A0A0A' })
      const filename = `${competitionName.replace(/\s+/g, '-').toLowerCase()}-picks-grid.png`

      const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      if (canShareFiles) {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], filename, { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: `${competitionName} — All Picks` })
          setSharing(false)
          return
        }
      }

      const link = document.createElement('a')
      link.href = dataUrl
      link.download = filename
      link.click()
      const text = encodeURIComponent(`${competitionName} — All Picks 🏆 (image saved — attach it here!)`)
      window.open(`https://wa.me/?text=${text}`, '_blank')
    } catch {
      setShareError('Could not generate the image — try again.')
    }
    setSharing(false)
  }

  return (
    <div className="bg-[#0A0A0A] text-white -m-6 p-6 print:bg-white print:text-black print:m-0 print:p-0 min-h-screen">
      <div className="flex items-center justify-between mb-6 print:hidden flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase" style={{ fontFamily: 'var(--font-display), sans-serif' }}>Printable Picks Grid</h1>
          <p className="text-white/50 text-sm">{competitionName} — every player&apos;s pick, every gameweek, one page. Hidden until each gameweek&apos;s deadline passes.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleShare}
            disabled={sharing}
            className="rounded px-4 py-2 text-sm font-bold disabled:opacity-50"
            style={{ backgroundColor: '#25D366', color: '#0b1a12' }}
          >
            {sharing ? 'Preparing...' : '📱 Share to WhatsApp'}
          </button>
          <PrintButton />
        </div>
      </div>
      {shareError && <p className="text-[#FA003C] text-xs mb-3 print:hidden">{shareError}</p>}

      <div ref={gridRef} className="bg-[#0A0A0A] print:bg-white p-4 print:p-0">
        <p className="hidden print:block text-lg font-bold mb-4">{competitionName} — All Picks</p>
        <p className="text-xl font-black uppercase mb-4 print:hidden" style={{ fontFamily: 'var(--font-display), sans-serif', color: '#CCFA00' }}>
          {competitionName} — All Picks
        </p>

        <div className="overflow-x-auto">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr>
                <th className="border border-white/15 print:border-black px-2 py-2 text-left bg-[#1B1B1B] print:bg-white text-white print:text-black uppercase tracking-wide sticky left-0 z-10">
                  Player
                </th>
                {gwColumns.map(gw => (
                  <th key={gw.id} className="border border-white/15 print:border-black px-2 py-2 bg-[#1B1B1B] print:bg-white text-white print:text-black whitespace-nowrap uppercase tracking-wide">
                    GW{gw.number}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {playerRows.map((player, i) => (
                <tr key={player.id} className={i % 2 === 0 ? 'bg-[#141414] print:bg-white' : 'bg-[#1B1B1B] print:bg-white'}>
                  <td className="border border-white/15 print:border-black px-2 py-1.5 font-bold whitespace-nowrap sticky left-0 z-10 bg-inherit">
                    {player.name}
                  </td>
                  {gwColumns.map(gw => {
                    if (!gw.revealed) {
                      return (
                        <td key={gw.id} className="border border-white/15 print:border-black px-2 py-1.5 text-center text-white/25 print:text-gray-400 italic whitespace-nowrap">
                          🔒 Hidden
                        </td>
                      )
                    }
                    const cell = player.cells[gw.id]
                    if (!cell) {
                      return <td key={gw.id} className="border border-white/15 print:border-black px-2 py-1.5 text-center text-white/25 print:text-gray-400">—</td>
                    }
                    return (
                      <td key={gw.id} className="border border-white/15 print:border-black px-2 py-1.5 align-top whitespace-nowrap">
                        <div className="font-black flex items-center gap-1" style={{ color: '#00F2FA' }}>
                          {cell.team}
                          {cell.isBanker && <span title="Banker" style={{ color: '#FA6100' }}>★</span>}
                          {cell.teamPoints !== null && <span className="font-mono">({cell.teamPoints})</span>}
                        </div>
                        <div className="text-white/70 print:text-gray-700">
                          {cell.player1Name} {cell.teamPoints !== null && <span className="font-mono">({cell.player1Points ?? 0})</span>}
                          {cell.aon?.onPlayer1 && (
                            <span className="ml-1 px-1 rounded font-black text-[9px]" style={{ background: aonStyle[cell.aon.outcome], color: cell.aon.outcome === 'success' ? '#0A0A0A' : '#FFFFFF' }}>
                              {aonLabel[cell.aon.outcome]}
                            </span>
                          )}
                        </div>
                        <div className="text-white/70 print:text-gray-700">
                          {cell.player2Name} {cell.teamPoints !== null && <span className="font-mono">({cell.player2Points ?? 0})</span>}
                          {cell.aon && !cell.aon.onPlayer1 && (
                            <span className="ml-1 px-1 rounded font-black text-[9px]" style={{ background: aonStyle[cell.aon.outcome], color: cell.aon.outcome === 'success' ? '#0A0A0A' : '#FFFFFF' }}>
                              {aonLabel[cell.aon.outcome]}
                            </span>
                          )}
                        </div>
                        {cell.bonusCard && (
                          <div className="mt-0.5">
                            <span className="px-1 rounded font-black text-[9px]" style={{ background: '#A000FA', color: '#FFFFFF' }}>
                              {bonusCardName}: {cell.bonusCard.playerName} {cell.bonusCard.points !== null && `(${cell.bonusCard.points})`}
                            </span>
                          </div>
                        )}
                        <div className="mt-1 font-mono font-black" style={{ color: '#CCFA00' }}>
                          {cell.gwTotal !== null ? `${cell.gwTotal} pts` : 'Pending'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {playerRows.length === 0 && (
                <tr>
                  <td colSpan={gwColumns.length + 1} className="border border-white/15 print:border-black px-2 py-4 text-center text-white/40">
                    No players yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-3 mt-4 text-[10px] text-white/50 print:text-gray-600">
          <span><span style={{ color: '#FA6100' }}>★</span> Banker</span>
          <span><span className="px-1 rounded font-black" style={{ background: aonStyle.pending, color: '#fff' }}>AoN</span> All or Nothing played, pending</span>
          <span><span className="px-1 rounded font-black" style={{ background: aonStyle.success, color: '#0A0A0A' }}>AoN ✓</span> succeeded</span>
          <span><span className="px-1 rounded font-black" style={{ background: aonStyle.failed, color: '#fff' }}>AoN ✕</span> failed</span>
          <span><span className="px-1 rounded font-black" style={{ background: '#A000FA', color: '#fff' }}>{bonusCardName}</span> played</span>
        </div>
      </div>
    </div>
  )
}

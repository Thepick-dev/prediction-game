'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'

type Tab = 'football' | 'rugby' | 'help'

function defaultTabFor(pathname: string): Tab {
  if (pathname.startsWith('/admin/rugby') || pathname.startsWith('/admin/help/rugby')) return 'rugby'
  if (pathname.startsWith('/admin/help')) return 'help'
  return 'football'
}

export default function AdminNav({
  notificationCount,
  pendingApprovals,
  pendingResets,
  pendingWallTotal,
}: {
  notificationCount: number
  pendingApprovals: number
  pendingResets: number
  pendingWallTotal: number
}) {
  const pathname = usePathname()
  const [tab, setTab] = useState<Tab>(() => defaultTabFor(pathname))

  const tabs: { key: Tab; label: string; color: string }[] = [
    { key: 'football', label: '⚽ Football', color: '#eab308' },
    { key: 'rugby', label: '🏉 Rugby', color: '#22c55e' },
    { key: 'help', label: '❓ Help', color: '#9ca3af' },
  ]

  return (
    <nav className="bg-black text-white px-6 py-3 print:hidden">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-lg uppercase tracking-wider flex items-center gap-2">
            Admin
            {notificationCount > 0 && (
              <a
                href="/admin/users"
                className="inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[11px] font-bold leading-none"
                style={{ minWidth: 18, height: 18, padding: '0 5px' }}
                title={`${pendingApprovals} pending approval${pendingApprovals === 1 ? '' : 's'}, ${pendingResets} password reset request${pendingResets === 1 ? '' : 's'}`}
              >
                {notificationCount}
              </a>
            )}
          </span>
          <div className="flex items-center gap-4">
            <a href="/picks" className="text-xs text-gray-400 hover:text-white uppercase tracking-wider">⚽ View Football</a>
            <a href="/rugby" className="text-xs text-gray-400 hover:text-white uppercase tracking-wider">🏉 View Rugby</a>
          </div>
        </div>

        <div className="text-xs text-gray-300 pb-1">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-2 mb-3">
            <div>
              <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Navigation</p>
              <div className="space-y-1.5">
                <a href="/admin" className="block hover:text-white">Dashboard</a>
                <a href="/admin/summary" className="block hover:text-white">Summary</a>
                <a href="/admin/users" className="hover:text-white inline-flex items-center gap-1.5">
                  Users
                  {notificationCount > 0 && (
                    <span className="inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold leading-none" style={{ minWidth: 16, height: 16, padding: '0 4px' }}>
                      {notificationCount}
                    </span>
                  )}
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 mb-3 pt-2" style={{ borderTop: '1px solid #333' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="uppercase tracking-widest text-[11px] font-bold px-3 py-1.5 rounded-t"
                style={{
                  color: tab === t.key ? t.color : '#6b7280',
                  background: tab === t.key ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderBottom: tab === t.key ? `2px solid ${t.color}` : '2px solid transparent',
                }}
              >
                {t.label}
                {t.key === 'football' && pendingWallTotal > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold leading-none" style={{ minWidth: 16, height: 16, padding: '0 4px' }}>
                    {pendingWallTotal}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'football' && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-2 mb-3">
              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Competition</p>
                <div className="space-y-1.5">
                  <a href="/admin/competitions" className="block hover:text-white">Competitions</a>
                  <a href="/admin/gameweeks" className="block hover:text-white">Gameweeks</a>
                  <a href="/admin/fixtures" className="block hover:text-white">Fixtures</a>
                  <a href="/admin/postponed" className="block hover:text-white">Postponed</a>
                </div>
              </div>

              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Weekly</p>
                <div className="space-y-1.5">
                  <a href="/admin/events" className="block hover:text-white">Events</a>
                  <a href="/admin/scoring" className="block hover:text-white">Scoring</a>
                  <a href="/admin/picks-log" className="block hover:text-white">Picks Log</a>
                  <a href="/admin/print-grid" className="block hover:text-white">Print Grid</a>
                  <a href="/admin/edit-pick" className="block hover:text-white">Edit Pick</a>
                  <a href="/admin/discipline" className="block hover:text-white">🟨🟥 Discipline</a>
                  <a href="/admin/wall" className="hover:text-white inline-flex items-center gap-1.5">
                    The Wall
                    {pendingWallTotal > 0 && (
                      <span className="inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold leading-none" style={{ minWidth: 16, height: 16, padding: '0 4px' }}>
                        {pendingWallTotal}
                      </span>
                    )}
                  </a>
                </div>
              </div>

              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Setup</p>
                <div className="space-y-1.5">
                  <a href="/admin/quartiles" className="block hover:text-white">Quartiles</a>
                  <a href="/admin/draft-tiers" className="block hover:text-white">Draft Tiers</a>
                  <a href="/admin/tiers" className="block hover:text-white">Tiers</a>
                  <a href="/admin/standings" className="block hover:text-white">Standings</a>
                  <a href="/admin/rules-text" className="block hover:text-white">Rules Text</a>
                </div>
              </div>

              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Data</p>
                <div className="space-y-1.5">
                  <a href="/admin/sync" className="block hover:text-white">Sync</a>
                  <a href="/admin/teams" className="block hover:text-white">Teams</a>
                  <a href="/admin/players" className="block hover:text-white">Players</a>
                  <a href="/admin/snapshots" className="block hover:text-white">Snapshots</a>
                </div>
              </div>

              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Other</p>
                <div className="space-y-1.5">
                  <a href="/admin/dispatch" className="block hover:text-white">News</a>
                  <a href="/admin/archive" className="block hover:text-white">Archive</a>
                  <a href="/admin/futzy" className="block hover:text-white">🤖 Futzy</a>
                  <a href="/admin/marketing" className="block hover:text-white">Marketing Consent</a>
                </div>
              </div>
            </div>
          )}

          {tab === 'rugby' && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-2 mb-3">
              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Competition</p>
                <div className="space-y-1.5">
                  <a href="/admin/rugby" className="block hover:text-white">Competitions</a>
                  <a href="/admin/rugby/rounds" className="block hover:text-white">Rounds &amp; Deadlines</a>
                  <a href="/admin/rugby/players" className="block hover:text-white">Players</a>
                  <a href="/admin/rugby/draftable-players" className="block hover:text-white">Draftable Players</a>
                </div>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Weekly</p>
                <div className="space-y-1.5">
                  <a href="/admin/rugby/results" className="block hover:text-white">Results &amp; Events</a>
                </div>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Setup</p>
                <div className="space-y-1.5">
                  <a href="/admin/rugby/scoring-rules" className="block hover:text-white">Scoring Rules</a>
                  <a href="/admin/rugby/external-competitions" className="block hover:text-white">External Data</a>
                  <a href="/admin/rugby/six-nations-recheck" className="block hover:text-white">Six Nations Recheck</a>
                </div>
              </div>
            </div>
          )}

          {tab === 'help' && (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-2">
              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Football</p>
                <div className="space-y-1.5">
                  <a href="/admin/help/weekly" className="block hover:text-white">Weekly Routine</a>
                  <a href="/admin/help/pre-season" className="block hover:text-white">New Season Setup</a>
                  <a href="/admin/help/deploying-changes" className="block hover:text-white">Making Changes Yourself</a>
                  <a href="/admin/help/bonus-card" className="block hover:text-white">The Bonus Card</a>
                  <a href="/admin/help/discipline" className="block hover:text-white">Yellow &amp; Red Cards</a>
                  <a href="/admin/help/pause-game" className="block hover:text-white">Pausing The Game</a>
                  <a href="/admin/help/futzy" className="block hover:text-white">Futzy</a>
                  <a href="/admin/help/snapshots" className="block hover:text-white">Snapshots</a>
                </div>
              </div>
              <div>
                <p className="text-gray-500 uppercase tracking-widest text-xs mb-1.5">Rugby</p>
                <div className="space-y-1.5">
                  <a href="/admin/help/rugby-new-season" className="block hover:text-white">Rugby Admin Guide</a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

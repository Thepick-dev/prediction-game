'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type ScoringRule = {
  id: string
  result_type: string
  quartile_diff: number
  points: number
}

type PlayerRule = {
  id: string
  event_type: string
  points: number
}

type Competition = { id: string; name: string }

export default function ScoringRulesPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [selectedComp, setSelectedComp] = useState<string>('')
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [playerRules, setPlayerRules] = useState<PlayerRule[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => {
    loadCompetitions()
  }, [])

  useEffect(() => {
    if (selectedComp) loadRules()
  }, [selectedComp])

  async function loadCompetitions() {
    const { data } = await supabase
      .from('competitions')
      .select('id, name')
      .order('created_at', { ascending: false })
    setCompetitions(data ?? [])
    if (data && data.length > 0) setSelectedComp(data[0].id)
  }

  async function loadRules() {
    const [{ data: teamRules }, { data: pRules }] = await Promise.all([
      supabase
        .from('competition_scoring_rules')
        .select('id, result_type, quartile_diff, points')
        .eq('competition_id', selectedComp)
        .order('result_type')
        .order('quartile_diff'),
      supabase
        .from('player_scoring_rules')
        .select('id, event_type, points')
        .eq('competition_id', selectedComp)
    ])
    setRules(teamRules ?? [])
    setPlayerRules(pRules ?? [])
  }

  function updateRule(id: string, points: number) {
    setRules(prev => prev.map(r => r.id === id ? { ...r, points } : r))
  }

  function updatePlayerRule(id: string, points: number) {
    setPlayerRules(prev => prev.map(r => r.id === id ? { ...r, points } : r))
  }

  async function saveRules() {
    setSaving(true)
    setMessage('')

    for (const rule of rules) {
      await supabase
        .from('competition_scoring_rules')
        .update({ points: rule.points })
        .eq('id', rule.id)
    }

    for (const rule of playerRules) {
      await supabase
        .from('player_scoring_rules')
        .update({ points: rule.points })
        .eq('id', rule.id)
    }

    setMessage('Scoring rules saved successfully')
    setSaving(false)
  }

  async function resetToDefaults() {
    setSaving(true)
    const defaults: Record<string, number[]> = {
      home_win:  [15, 20, 25, 30, 35, 40, 45],
      away_win:  [25, 30, 35, 40, 45, 50, 55],
      home_draw: [4,  6,  8,  10, 12, 14, 16],
      away_draw: [7,  9,  11, 13, 15, 17, 19],
    }

    const updates = rules.map(rule => {
      const diffs = [-3, -2, -1, 0, 1, 2, 3]
      const index = diffs.indexOf(rule.quartile_diff)
      const defaultPoints = defaults[rule.result_type]?.[index] ?? rule.points
      return { ...rule, points: defaultPoints }
    })

    setRules(updates)

    setPlayerRules(prev => prev.map(r => ({
      ...r,
      points: r.event_type === 'goal' ? 12 : 6
    })))

    setSaving(false)
    setMessage('Reset to defaults — click Save to apply')
  }

  const resultTypes = ['home_win', 'away_win', 'home_draw', 'away_draw']
  const diffs = [-3, -2, -1, 0, 1, 2, 3]
  const diffLabels = ['3 Down', '2 Down', '1 Down', 'Level', '1 Up', '2 Up', '3 Up']

  const resultLabels: Record<string, string> = {
    home_win: 'Home Win',
    away_win: 'Away Win',
    home_draw: 'Home Draw',
    away_draw: 'Away Draw',
  }

  function getPoints(resultType: string, diff: number): { id: string; points: number } {
    const rule = rules.find(r => r.result_type === resultType && r.quartile_diff === diff)
    return rule ? { id: rule.id, points: rule.points } : { id: '', points: 0 }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-8">Scoring Rules</h1>

      <div className="mb-6 flex items-center gap-4">
        <select
          value={selectedComp}
          onChange={e => setSelectedComp(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          {competitions.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {rules.length > 0 && (
        <>
          <div className="bg-white border rounded-lg p-6 mb-6 overflow-x-auto">
            <h2 className="font-bold mb-4">Team Points Table</h2>
            <p className="text-sm text-gray-500 mb-4">Up/Down refers to quartile differential from your picked team's perspective. Click any value to edit it.</p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 pr-4">Result</th>
                  {diffLabels.map(label => (
                    <th key={label} className="text-center pb-2 px-2 text-gray-500 text-xs">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultTypes.map(resultType => (
                  <tr key={resultType} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{resultLabels[resultType]}</td>
                    {diffs.map(diff => {
                      const { id, points } = getPoints(resultType, diff)
                      return (
                        <td key={diff} className="py-3 px-2 text-center">
                          <input
                            type="number"
                            value={points}
                            onChange={e => updateRule(id, parseInt(e.target.value) || 0)}
                            className="w-14 border rounded px-1 py-1 text-center text-sm"
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="font-bold mb-4">Player Points</h2>
            <div className="flex gap-6">
              {playerRules.map(rule => (
                <div key={rule.id} className="flex items-center gap-3">
                  <label className="text-sm font-medium capitalize">{rule.event_type}</label>
                  <input
                    type="number"
                    value={rule.points}
                    onChange={e => updatePlayerRule(rule.id, parseInt(e.target.value) || 0)}
                    className="w-16 border rounded px-2 py-1 text-center text-sm"
                  />
                  <span className="text-sm text-gray-500">pts</span>
                </div>
              ))}
            </div>
          </div>

          {message && (
            <p className={`mb-4 text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
              {message}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={saveRules}
              disabled={saving}
              className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={resetToDefaults}
              disabled={saving}
              className="border rounded px-4 py-2 text-sm hover:border-black disabled:opacity-50"
            >
              Reset to Defaults
            </button>
          </div>
        </>
      )}

      {rules.length === 0 && selectedComp && (
        <div className="bg-white border rounded-lg p-6">
          <p className="text-gray-500 text-sm">No scoring rules found for this competition. Make sure you created the competition using the Create Competition form — this automatically adds default rules.</p>
        </div>
      )}
    </div>
  )
}
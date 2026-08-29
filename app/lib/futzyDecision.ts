// Futzy's actual pick DECISION — separate concern from futzyVoice.ts (his
// Wall comment/personality, which never influences what he picks). The
// maths in botPick.ts still does all the real work: computing every legal
// team/player's projected points, respecting every use-count/double-use
// rule. This only asks Gemini to choose among the maths' own top few
// candidates — never anything outside that shortlist — so a bad or
// unparseable response can only ever fall back to the deterministic
// top-projected pick, never produce an illegal one. Best-effort only, same
// as generateFutzyVoice: any failure here (missing key, network,
// malformed response, an id outside the shortlist) resolves to null rather
// than throwing, and the caller falls straight back to the pure maths pick.

type TeamOption = { team_id: number; name: string; projected: number }
type PlayerOption = {
  player_id: number
  name: string
  team_name: string
  projected: number
  chance_of_playing: number | null
  injury_news: string | null
}

export type FutzyDecision = { team_id: number; player1_id: number; player2_id: number; reasoning: string }

function buildPrompt(teams: TeamOption[], players: PlayerOption[]): string {
  const teamLines = teams.map(t => `- id ${t.team_id}: ${t.name} (projected ${t.projected.toFixed(1)} pts)`).join('\n')
  const playerLines = players.map(p => {
    const fitness = p.chance_of_playing != null ? `${p.chance_of_playing}% chance of playing` : 'no fitness doubt on record'
    const news = p.injury_news ? ` — news: "${p.injury_news}"` : ''
    return `- id ${p.player_id}: ${p.name} (${p.team_name}, projected ${p.projected.toFixed(1)} pts, ${fitness})${news}`
  }).join('\n')

  return `You are helping choose Futzy's pick for a Premier League prediction game gameweek. A statistical model has already narrowed this down to the strongest legal options — your job is to pick the single best combination from EXACTLY these options, using the projected points as your primary signal but weighing the fitness/news notes where they matter (e.g. prefer a lower-projected but clearly fit player over a higher-projected one who's a doubt or carries concerning news).

Team options (pick exactly one):
${teamLines}

Player options (pick exactly two DIFFERENT players):
${playerLines}

Reply ONLY with JSON in this exact shape: {"team_id": number, "player1_id": number, "player2_id": number, "reasoning": string}
The three ids MUST come from the lists above exactly as given. "reasoning" is a short (under 30 words) plain-English note for an admin log — never shown to players — explaining your choice.`
}

export async function chooseFutzyPick(teams: TeamOption[], players: PlayerOption[]): Promise<FutzyDecision | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  if (teams.length === 0 || players.length < 2) return null

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(teams, players) }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )

    if (!res.ok) return null

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null

    const parsed = JSON.parse(text)
    const team_id = Number(parsed.team_id)
    const player1_id = Number(parsed.player1_id)
    const player2_id = Number(parsed.player2_id)
    const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning.trim().slice(0, 280) : ''

    // Never trust the response's ids at face value — every one of them
    // must be exactly one of the options actually offered, or this is
    // discarded entirely and the caller falls back to the pure maths pick.
    const validTeam = teams.some(t => t.team_id === team_id)
    const validPlayer1 = players.some(p => p.player_id === player1_id)
    const validPlayer2 = players.some(p => p.player_id === player2_id)
    if (!validTeam || !validPlayer1 || !validPlayer2 || player1_id === player2_id) return null

    return { team_id, player1_id, player2_id, reasoning }
  } catch {
    return null
  }
}

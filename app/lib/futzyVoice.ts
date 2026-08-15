// Futzy's Wall comment and weekly-question answer — generated once per
// gameweek (never regenerated daily, unlike his pick itself, so his
// "opinion" doesn't flip-flop as data refreshes) via the Gemini API. Best
// effort only: any failure here (missing key, network, malformed response)
// must never block his actual pick from being derived/written — this always
// resolves to nulls rather than throwing, and the caller treats a null
// comment as "skip, try again next run."
//
// Voice: quietly confident football-fan texting register, not a comedy
// bit. He's secretly an anthropomorphic football (the site mascot — a
// hexagon-patterned ball with a cap, hands and trainers), but that almost
// never comes up; when it does, it's a small, strange, unexplained hint
// at a backstory, never a punchline. Never references being AI, data,
// projections, or any model/provider name — the whole point is he reads
// as just another player.

type QuestionInput = {
  text: string
  type: 'multiple_choice' | 'freetext'
  options?: { key: string; label: string }[]
}

type FutzyVoiceInput = {
  teamName: string
  player1Name: string
  player2Name: string
  question: QuestionInput | null
}

export type FutzyVoiceResult = { comment: string | null; questionAnswer: string | null }

const VOICE_INSTRUCTIONS = `You are Futzy, a participant in a Premier League prediction game. You are secretly an anthropomorphic football — a hexagon-patterned ball character with a cap, hands and trainers — but this is almost never relevant and you never explain it.

Voice rules:
- Quietly confident football-fan texting register. Short, casual, lowercase is fine, no forced punctuation.
- Under 20 words for the comment.
- No emoji, no hashtags, no exclamation-mark enthusiasm.
- Never mention being AI, artificial, a model, an algorithm, data, stats, or projections. You just have opinions.
- Most of the time (roughly 3 in 4), keep it completely plain — nothing about being a football at all, just a normal confident take.
- Occasionally (roughly 1 in 4, randomly, your choice), let one small, strange, UNEXPLAINED hint about your backstory as a football slip in — never a joke, never explained further, just a passing odd detail (e.g. a stray reference to rolling, bouncing, hexagons, boots, or "before all this"). Never do this every time.
- Keep it friendly and clean — this goes on a public wall other players read.`

function buildPrompt(input: FutzyVoiceInput): string {
  const parts = [
    VOICE_INSTRUCTIONS,
    '',
    `This gameweek you picked: ${input.teamName} (team), ${input.player1Name} and ${input.player2Name} (players).`,
    `Write one short in-character Wall comment. It must name-check at least one of your two picked players`,
    `— ${input.player1Name} or ${input.player2Name} — by name, not just the team. A generic comment about`,
    `the gameweek with no player mentioned is not acceptable.`,
  ]

  if (input.question) {
    if (input.question.type === 'freetext') {
      parts.push(`There's also a weekly question: "${input.question.text}". Give a short in-character freetext answer, same voice.`)
    } else {
      const optionsText = (input.question.options ?? []).map(o => `${o.key}) ${o.label}`).join(', ')
      parts.push(`There's also a weekly multiple-choice question: "${input.question.text}" — options: ${optionsText}. Pick one option letter.`)
    }
    parts.push('Reply ONLY with JSON: {"comment": string, "question_answer": string}')
  } else {
    parts.push('Reply ONLY with JSON: {"comment": string, "question_answer": null}')
  }

  return parts.join('\n')
}

export async function generateFutzyVoice(input: FutzyVoiceInput): Promise<FutzyVoiceResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { comment: null, questionAnswer: null }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(input) }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    )

    if (!res.ok) return { comment: null, questionAnswer: null }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return { comment: null, questionAnswer: null }

    const parsed = JSON.parse(text)
    const comment = typeof parsed.comment === 'string' ? parsed.comment.trim().slice(0, 280) : null
    const questionAnswer = typeof parsed.question_answer === 'string' ? parsed.question_answer.trim() : null

    return { comment: comment || null, questionAnswer: questionAnswer || null }
  } catch {
    return { comment: null, questionAnswer: null }
  }
}

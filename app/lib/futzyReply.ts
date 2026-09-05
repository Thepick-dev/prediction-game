import { VOICE_INSTRUCTIONS } from './futzyVoice'

// Admin-triggered — a draft reply to an existing (already-approved) Wall
// comment, in Futzy's established voice, with an admin-chosen tone. Same
// fetch/model/env-var/error-handling pattern as generateFutzyVoice: best
// effort only, never throws, resolves to null on any failure (missing
// key, network, bad JSON) so the caller can show a plain "try again"
// message rather than a raw error.

export type FutzyReplyTone = 'friendly' | 'funny' | 'aggressive' | 'sad'

const TONE_INSTRUCTIONS: Record<FutzyReplyTone, string> = {
  friendly: 'Tone for this reply: warm and supportive, genuinely on their side.',
  funny: 'Tone for this reply: go for the joke — playful and a bit cheeky.',
  aggressive: 'Tone for this reply: cocky, needling banter and trash talk — competitive ribbing, never actually cruel, insulting, or personal.',
  sad: 'Tone for this reply: mock-mopey, dramatically wounded/defeated about it.',
}

type FutzyReplyInput = {
  originalComment: string
  tone: FutzyReplyTone
  hint?: string | null
}

function buildPrompt({ originalComment, tone, hint }: FutzyReplyInput): string {
  const parts = [
    VOICE_INSTRUCTIONS,
    '',
    `Someone on the Wall wrote this: "${originalComment}"`,
    'Write one short in-character reply to them.',
    TONE_INSTRUCTIONS[tone],
  ]
  if (hint?.trim()) {
    parts.push(`Also work this in if it fits naturally, without forcing it: ${hint.trim()}`)
  }
  parts.push('Whatever the tone, this is still just banter between people who get on — never genuinely mean, insulting, or hurtful.')
  parts.push('Reply ONLY with JSON: {"reply": string}')
  return parts.join('\n')
}

export async function generateFutzyReply(input: FutzyReplyInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

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

    if (!res.ok) return null

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null

    const parsed = JSON.parse(text)
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim().slice(0, 150) : null
    return reply || null
  } catch {
    return null
  }
}

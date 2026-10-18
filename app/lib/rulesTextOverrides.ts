import { RULES_TEXT } from './rulesText'

// One row per section in rules_text_overrides (section_key -> content),
// admin-editable from /admin/rules-text with a reset-to-default per
// section. Every call site that used to read RULES_TEXT directly now
// reads the result of resolveRulesText(overrides) instead — same shape,
// same keys, so nothing else about how it's rendered has to change.
export const RULES_SECTIONS: { key: keyof typeof RULES_TEXT; label: string; hint: string }[] = [
  { key: 'competition', label: 'The Competition', hint: 'Separate paragraphs with a blank line.' },
  { key: 'tierDraft', label: 'The Tier Draft', hint: 'Separate paragraphs with a blank line.' },
  { key: 'weeklyPicks', label: 'Weekly Picks', hint: 'Separate paragraphs with a blank line.' },
  { key: 'pickPrivacy', label: 'Your Picks Stay Private', hint: 'Separate paragraphs with a blank line.' },
  { key: 'banker', label: 'The Banker', hint: 'Separate paragraphs with a blank line.' },
  { key: 'allOrNothing', label: 'All or Nothing', hint: 'Separate paragraphs with a blank line.' },
  { key: 'bonusCard', label: 'Bonus Card', hint: 'Separate paragraphs with a blank line.' },
  { key: 'futzy', label: 'Futzy', hint: 'Separate paragraphs with a blank line.' },
  { key: 'discipline', label: 'Yellow & Red Cards', hint: 'Separate paragraphs with a blank line.' },
  { key: 'autopick', label: 'Autopick', hint: 'Separate paragraphs with a blank line.' },
  { key: 'quartiles', label: 'Quartiles', hint: 'Separate paragraphs with a blank line.' },
  { key: 'scoringIntro', label: 'Scoring — intro line', hint: 'A single line.' },
  { key: 'tiebreakers', label: 'Tiebreakers', hint: 'One per line, in the order they apply.' },
]

function isMultilineList(key: string) {
  return key === 'tiebreakers'
}

// The textarea representation of whichever section this is — paragraphs
// joined by a blank line, except tiebreakers (a short ordered list, one
// per line) and scoringIntro (already a single line).
export function defaultTextFor(key: keyof typeof RULES_TEXT): string {
  const val = RULES_TEXT[key]
  if (Array.isArray(val)) return val.join(isMultilineList(key) ? '\n' : '\n\n')
  return String(val ?? '')
}

function parseTextFor(key: keyof typeof RULES_TEXT, raw: string): string[] | string {
  if (key === 'scoringIntro') return raw.trim()
  const separator = isMultilineList(key) ? '\n' : '\n\n'
  return raw.split(separator).map(p => p.trim()).filter(Boolean)
}

// Merges admin overrides onto the hardcoded defaults. An override with
// empty/whitespace-only content is treated as "no override" rather than
// blanking the section — reset-to-default is its own explicit action
// (deleting the row), not just clearing the textarea.
export function resolveRulesText(overrides: Record<string, string>): typeof RULES_TEXT {
  const result = { ...RULES_TEXT }
  for (const section of RULES_SECTIONS) {
    const raw = overrides[section.key]
    if (!raw || !raw.trim()) continue
    ;(result as any)[section.key] = parseTextFor(section.key, raw)
  }
  return result
}

// Shared by every place a username can be set or changed (signup, the
// server-side complete-signup route, Settings) so the rule can never drift
// between client and server copies.
export const USERNAME_MAX_LENGTH = 12

// Letters, numbers, and emoji only — no punctuation or symbols. "@" in
// particular would break login: resolveIdentifier (app/lib/auth-identifier.ts)
// decides "is this an email or a username" purely by checking whether the
// typed identifier contains "@", so a username with one in it would get
// misrouted into the email lookup and could never log in with it.
// \p{Extended_Pictographic} covers the overwhelming majority of real-world
// emoji use — one fun symbol in a username. Deliberately not also trying
// to allow the joiner/variation-selector/skin-tone code points needed for
// multi-part compound emoji (a family, a flag, a skin-toned gesture) —
// each of those is its own invisible-in-source-code special character,
// not worth the fragility for a feature this minor.
const USERNAME_PATTERN = /^[\p{L}\p{N}\p{Extended_Pictographic}]+$/u

export function isValidUsername(username: string): boolean {
  const trimmed = username.trim()
  if (!trimmed || trimmed.length > USERNAME_MAX_LENGTH) return false
  return USERNAME_PATTERN.test(trimmed)
}

export const USERNAME_RULES_MESSAGE = `Letters, numbers and emoji only, ${USERNAME_MAX_LENGTH} characters or fewer`

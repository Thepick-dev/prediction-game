// Shared by every place a password can be set or changed (signup, Settings,
// the rugby module's own Settings, and the reset-with-code route) so the
// rule can never drift between client and server copies — same reasoning
// as USERNAME_MAX_LENGTH in username.ts. Raised from the old 4-character
// minimum ahead of public sign-up; never applied retroactively to an
// existing player's already-set password, only to new ones going forward.
export const MIN_PASSWORD_LENGTH = 8

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH
}

export const PASSWORD_RULES_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`

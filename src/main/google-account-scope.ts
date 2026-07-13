import { createHash } from 'node:crypto'

interface GoogleAccountIdentity {
  email?: string
  subject?: string
  refreshToken?: string
}

export function googleAccountScope(tokens: GoogleAccountIdentity | null): string {
  if (!tokens) return 'demo'
  // Email was available on tokens created before subject IDs were persisted. Keep it
  // canonical so reconnecting the same account does not move its chat history.
  const normalizedEmail = tokens.email?.trim().toLowerCase()
  const identity = normalizedEmail || tokens.subject || tokens.refreshToken
  if (!identity) return 'connected-unknown'
  return `google-${createHash('sha256').update(identity).digest('hex')}`
}

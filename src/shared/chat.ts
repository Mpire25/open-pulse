import type { ChatRetention, ChatSession } from './types'

const DEFAULT_CHAT_TITLE = 'New chat'

const DAY_MS = 86_400_000
const RETENTION_DURATIONS: Record<Exclude<ChatRetention, 'forever' | 'session'>, number> = {
  '24-hours': DAY_MS,
  '7-days': 7 * DAY_MS,
  '30-days': 30 * DAY_MS
}

/**
 * The instant before which an unprotected chat is considered expired. `session`
 * measures from app launch; everything else is a rolling window from now.
 */
export function retentionCutoff(retention: ChatRetention, sessionStartedAt: number): number | null {
  if (retention === 'forever') return null
  if (retention === 'session') return sessionStartedAt
  return Date.now() - RETENTION_DURATIONS[retention]
}

/** Pinning and keeping are both explicit "this matters" signals, so both exempt. */
export function isChatRetained(session: Pick<ChatSession, 'pinned' | 'kept' | 'updatedAt'>, cutoff: number): boolean {
  return session.pinned === true || session.kept === true || Date.parse(session.updatedAt) >= cutoff
}

/** How many chats a retention policy would delete right now — for the confirm dialog. */
export function expiringChatCount(
  sessions: Array<Pick<ChatSession, 'pinned' | 'kept' | 'updatedAt'>>,
  retention: ChatRetention,
  sessionStartedAt: number
): number {
  const cutoff = retentionCutoff(retention, sessionStartedAt)
  if (cutoff == null) return 0
  return sessions.filter((session) => !isChatRetained(session, cutoff)).length
}

export function generateChatTitle(text: string): string {
  const cleaned = text
    .replace(/[`*_>#|\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return DEFAULT_CHAT_TITLE
  const sentence = cleaned.split(/(?<=[.!?])\s/, 1)[0].replace(/[.!?]+$/, '')
  if (sentence.length <= 48) return sentence
  const clipped = sentence.slice(0, 48).replace(/\s+\S*$/, '').trim()
  return `${clipped || sentence.slice(0, 48).trim()}…`
}

export interface InterruptedTurnState {
  text: string
  transient: boolean
}

export function interruptedTurnState(text: string, message: string): InterruptedTurnState {
  const partial = text.trimEnd()
  return partial
    ? { text: `${partial}\n\n_${message}_`, transient: false }
    : { text: message, transient: true }
}

export { DEFAULT_CHAT_TITLE }

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { generateChatTitle, DEFAULT_CHAT_TITLE } from '../shared/chat'
import type { ChatHistorySnapshot, ChatSession, ChatSessionMessage } from '../shared/types'

interface EncryptionAdapter {
  available: () => boolean
  encrypt: (plainText: string) => Buffer
  decrypt: (cipherText: Buffer) => string
}

interface PersistedChatHistory {
  version: 1
  accounts: Record<string, ChatSession[]>
}

interface EncryptedEnvelope {
  version: 1
  cipherText: string
}

const EMPTY_HISTORY: PersistedChatHistory = { version: 1, accounts: {} }

function isoNow(): string {
  return new Date().toISOString()
}

function validDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback
}

function normalizeMessages(value: unknown): ChatSessionMessage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((message): ChatSessionMessage[] => {
    if (!message || typeof message !== 'object') return []
    const candidate = message as Partial<ChatSessionMessage>
    if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.text !== 'string') {
      return []
    }
    const createdAt = validDate(candidate.createdAt, isoNow())
    return [{ id: typeof candidate.id === 'string' ? candidate.id : randomUUID(), role: candidate.role, text: candidate.text, createdAt }]
  })
}

function normalizeSession(value: unknown): ChatSession | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ChatSession>
  if (typeof candidate.id !== 'string') return null
  const createdAt = validDate(candidate.createdAt, isoNow())
  const messages = normalizeMessages(candidate.messages)
  const firstUserMessage = messages.find((message) => message.role === 'user')
  return {
    id: candidate.id,
    title:
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim().slice(0, 80)
        : firstUserMessage
          ? generateChatTitle(firstUserMessage.text)
          : DEFAULT_CHAT_TITLE,
    createdAt,
    updatedAt: validDate(candidate.updatedAt, createdAt),
    ...(candidate.pinned === true ? { pinned: true } : {}),
    messages
  }
}

function sortSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export class ChatHistoryStore {
  private cache: PersistedChatHistory | null = null

  constructor(
    private readonly path: string,
    private readonly encryption: EncryptionAdapter
  ) {}

  snapshot(accountScope: string): ChatHistorySnapshot {
    return {
      sessions: sortSessions(this.load().accounts[accountScope] ?? [])
        .filter((session) => session.messages.length > 0)
        .map((session) => structuredClone(session)),
      persistence: this.encryption.available() ? 'encrypted' : 'memory'
    }
  }

  create(accountScope: string, requestedId?: string): ChatSession {
    const history = this.load()
    const existing = requestedId
      ? (history.accounts[accountScope] ?? []).find((session) => session.id === requestedId)
      : null
    if (existing) return structuredClone(existing)
    const now = isoNow()
    const session: ChatSession = {
      id: requestedId ?? randomUUID(),
      title: DEFAULT_CHAT_TITLE,
      createdAt: now,
      updatedAt: now,
      messages: []
    }
    history.accounts[accountScope] = [session, ...(history.accounts[accountScope] ?? [])]
    this.persist()
    return structuredClone(session)
  }

  update(accountScope: string, id: string, messages: ChatSessionMessage[]): ChatSession {
    const session = this.find(accountScope, id)
    session.messages = normalizeMessages(messages)
    const firstUserMessage = session.messages.find((message) => message.role === 'user')
    if (firstUserMessage && session.title === DEFAULT_CHAT_TITLE) {
      session.title = generateChatTitle(firstUserMessage.text)
    }
    session.updatedAt = isoNow()
    this.persist()
    return structuredClone(session)
  }

  setPinned(accountScope: string, id: string, pinned: boolean): ChatSession {
    const session = this.find(accountScope, id)
    // Pinning deliberately leaves updatedAt alone so it doesn't fake recency.
    if (pinned) session.pinned = true
    else delete session.pinned
    this.persist()
    return structuredClone(session)
  }

  delete(accountScope: string, id: string): ChatHistorySnapshot {
    const history = this.load()
    const sessions = history.accounts[accountScope] ?? []
    if (!sessions.some((session) => session.id === id)) throw new Error('Chat not found.')
    history.accounts[accountScope] = sessions.filter((session) => session.id !== id)
    this.persist()
    return this.snapshot(accountScope)
  }

  private find(accountScope: string, id: string): ChatSession {
    const session = (this.load().accounts[accountScope] ?? []).find((candidate) => candidate.id === id)
    if (!session) throw new Error('Chat not found.')
    return session
  }

  private load(): PersistedChatHistory {
    if (this.cache) return this.cache
    if (!this.encryption.available()) {
      this.cache = structuredClone(EMPTY_HISTORY)
      return this.cache
    }
    try {
      if (!existsSync(this.path)) throw new Error('No history yet.')
      const envelope = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<EncryptedEnvelope>
      if (envelope.version !== 1 || typeof envelope.cipherText !== 'string') throw new Error('Invalid history envelope.')
      const decrypted = this.encryption.decrypt(Buffer.from(envelope.cipherText, 'base64'))
      const parsed = JSON.parse(decrypted) as Partial<PersistedChatHistory>
      const accounts = Object.fromEntries(
        Object.entries(parsed.accounts ?? {}).map(([scope, sessions]) => [
          scope,
          Array.isArray(sessions) ? sessions.map(normalizeSession).filter((session): session is ChatSession => session != null) : []
        ])
      )
      this.cache = { version: 1, accounts }
    } catch {
      this.cache = structuredClone(EMPTY_HISTORY)
    }
    return this.cache
  }

  private persist(): void {
    if (!this.encryption.available()) return
    const encrypted = this.encryption.encrypt(JSON.stringify(this.load())).toString('base64')
    const temporaryPath = `${this.path}.tmp`
    writeFileSync(temporaryPath, JSON.stringify({ version: 1, cipherText: encrypted } satisfies EncryptedEnvelope), {
      encoding: 'utf8',
      mode: 0o600
    })
    renameSync(temporaryPath, this.path)
  }
}

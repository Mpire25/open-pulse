import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import type { AppSettings, ChatRetention, ChatSession, ChatSessionMessage } from '../shared/types'
import { getGoogleAccountScope } from './google-auth'
import { ChatHistoryStore } from './chat-history-store'
import { getSettings, updateSettings } from './store'

let store: ChatHistoryStore | null = null
const sessionStartedAt = Date.now()

function historyStore(): ChatHistoryStore {
  store ??= new ChatHistoryStore(join(app.getPath('userData'), 'chat-history.enc.json'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plainText) => safeStorage.encryptString(plainText),
    decrypt: (cipherText) => safeStorage.decryptString(cipherText)
  })
  return store
}

type ObserveSession = (accountScope: string, session: ChatSession) => void

export function getChatHistory(observe?: ObserveSession) {
  const store = historyStore()
  const accountScope = getGoogleAccountScope()
  store.purgeExpired(accountScope, getSettings().chatRetention, sessionStartedAt)
  const snapshot = store.snapshot(accountScope)
  for (const session of snapshot.sessions) observe?.(accountScope, session)
  return snapshot
}

/** Total chats a policy would delete now, across every stored account. */
export function previewChatRetention(retention: ChatRetention): number {
  return historyStore().previewExpiring(retention, sessionStartedAt)
}

/**
 * Saves the policy and applies it in the same step, so the number the user
 * confirmed is exactly what gets deleted — no account quietly expiring later.
 *
 * Cleanup runs first on purpose. If the history write fails the policy is never
 * saved, so a later launch cannot silently delete what this call could not; the
 * reverse order would leave a policy armed against chats still on disk.
 */
export function applyChatRetention(retention: ChatRetention): AppSettings {
  historyStore().purgeAllExpired(retention, sessionStartedAt)
  return updateSettings({ chatRetention: retention })
}

export function createChatSession(id?: string, observe?: ObserveSession) {
  const scope = getGoogleAccountScope()
  const session = historyStore().create(scope, id)
  observe?.(scope, session)
  return session
}

export function updateChatSession(id: string, messages: ChatSessionMessage[], observe?: ObserveSession) {
  const scope = getGoogleAccountScope()
  const session = historyStore().update(scope, id, messages)
  observe?.(scope, session)
  return session
}

// Callers already captured the scope during a foreground history operation.
export function claimChatTitle(scope: string, id: string, messageId: string) {
  return historyStore().claimTitle(scope, id, messageId)
}

export function completeChatTitle(scope: string, id: string, message: ChatSessionMessage, title: string) {
  return historyStore().completeTitle(scope, id, message, title)
}

export function setChatSessionPinned(id: string, pinned: boolean) {
  return historyStore().setPinned(getGoogleAccountScope(), id, pinned)
}

export function setChatSessionKept(id: string, kept: boolean) {
  return historyStore().setKept(getGoogleAccountScope(), id, kept)
}

export function deleteChatSession(id: string) {
  return historyStore().delete(getGoogleAccountScope(), id)
}

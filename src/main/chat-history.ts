import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import type { AppSettings, ChatRetention, ChatSessionMessage } from '../shared/types'
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

export function getChatHistory() {
  const store = historyStore()
  const accountScope = getGoogleAccountScope()
  store.purgeExpired(accountScope, getSettings().chatRetention, sessionStartedAt)
  return store.snapshot(accountScope)
}

/** Total chats a policy would delete now, across every stored account. */
export function previewChatRetention(retention: ChatRetention): number {
  return historyStore().previewExpiring(retention, sessionStartedAt)
}

/**
 * Saves the policy and applies it in the same step, so the number the user
 * confirmed is exactly what gets deleted — no account quietly expiring later.
 */
export function applyChatRetention(retention: ChatRetention): AppSettings {
  const settings = updateSettings({ chatRetention: retention })
  historyStore().purgeAllExpired(retention, sessionStartedAt)
  return settings
}

export function createChatSession(id?: string) {
  return historyStore().create(getGoogleAccountScope(), id)
}

export function updateChatSession(id: string, messages: ChatSessionMessage[]) {
  return historyStore().update(getGoogleAccountScope(), id, messages)
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

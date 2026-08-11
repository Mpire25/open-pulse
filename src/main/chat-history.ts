import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import type { ChatSessionMessage } from '../shared/types'
import { getGoogleAccountScope } from './google-auth'
import { ChatHistoryStore } from './chat-history-store'
import { getSettings } from './store'

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

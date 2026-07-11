import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import type { ChatSessionMessage } from '../shared/types'
import { getGoogleAccountScope } from './google-auth'
import { ChatHistoryStore } from './chat-history-store'

let store: ChatHistoryStore | null = null

function historyStore(): ChatHistoryStore {
  store ??= new ChatHistoryStore(join(app.getPath('userData'), 'chat-history.enc.json'), {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plainText) => safeStorage.encryptString(plainText),
    decrypt: (cipherText) => safeStorage.decryptString(cipherText)
  })
  return store
}

export function getChatHistory() {
  return historyStore().snapshot(getGoogleAccountScope())
}

export function createChatSession(id?: string) {
  return historyStore().create(getGoogleAccountScope(), id)
}

export function updateChatSession(id: string, messages: ChatSessionMessage[]) {
  return historyStore().update(getGoogleAccountScope(), id, messages)
}

export function deleteChatSession(id: string) {
  return historyStore().delete(getGoogleAccountScope(), id)
}

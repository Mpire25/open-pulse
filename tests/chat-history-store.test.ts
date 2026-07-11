import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ChatHistoryStore } from '../src/main/chat-history-store'
import type { ChatSessionMessage } from '../src/shared/types'

const temporaryDirectories: string[] = []

function temporaryPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'open-pulse-chat-test-'))
  temporaryDirectories.push(directory)
  return join(directory, 'chat-history.enc.json')
}

function encryptedAdapter(available = true) {
  return {
    available: () => available,
    encrypt: (plainText: string) => Buffer.from(`encrypted:${plainText}`, 'utf8'),
    decrypt: (cipherText: Buffer) => cipherText.toString('utf8').replace(/^encrypted:/, '')
  }
}

function userMessage(text: string): ChatSessionMessage {
  return { id: crypto.randomUUID(), role: 'user', text, createdAt: new Date().toISOString() }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('encrypted chat history store', () => {
  test('keeps empty drafts out of history until the first message', () => {
    const store = new ChatHistoryStore(temporaryPath(), encryptedAdapter())
    const id = crypto.randomUUID()
    const draft = store.create('account-a', id)

    expect(draft.id).toBe(id)
    expect(store.snapshot('account-a').sessions).toEqual([])
    expect(store.create('account-a', id).id).toBe(id)

    store.update('account-a', id, [userMessage('Now this is a real chat')])
    expect(store.snapshot('account-a').sessions).toHaveLength(1)
  })

  test('persists an encrypted envelope and restores account-scoped chats', () => {
    const path = temporaryPath()
    const store = new ChatHistoryStore(path, encryptedAdapter())
    const chat = store.create('account-a')
    store.update('account-a', chat.id, [userMessage('Compare my sleep and recovery this month')])

    const diskContents = readFileSync(path, 'utf8')
    expect(diskContents).not.toContain('Compare my sleep')
    expect(diskContents).not.toContain('account-a')

    const restored = new ChatHistoryStore(path, encryptedAdapter())
    expect(restored.snapshot('account-a').sessions[0].title).toBe('Compare my sleep and recovery this month')
    expect(restored.snapshot('account-b').sessions).toEqual([])
    expect(restored.snapshot('account-a').persistence).toBe('encrypted')
  })

  test('never writes sensitive history when encryption is unavailable', () => {
    const path = temporaryPath()
    const store = new ChatHistoryStore(path, encryptedAdapter(false))
    const chat = store.create('account-a')
    store.update('account-a', chat.id, [userMessage('Private health question')])

    expect(store.snapshot('account-a').sessions).toHaveLength(1)
    expect(store.snapshot('account-a').persistence).toBe('memory')
    expect(() => readFileSync(path, 'utf8')).toThrow()
    expect(new ChatHistoryStore(path, encryptedAdapter(false)).snapshot('account-a').sessions).toEqual([])
  })

  test('permanently deletes within one account', () => {
    const store = new ChatHistoryStore(temporaryPath(), encryptedAdapter())
    const chat = store.create('account-a')

    expect(store.delete('account-a', chat.id).sessions).toEqual([])
    expect(() => store.delete('account-b', chat.id)).toThrow('Chat not found.')
  })
})

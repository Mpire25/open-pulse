import { afterAll, describe, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = mkdtempSync(join(tmpdir(), 'open-pulse-retention-apply-'))
const historyPath = join(userData, 'chat-history.enc.json')

// Ciphertext this adapter cannot read, standing in for a locked keychain.
writeFileSync(historyPath, JSON.stringify({ version: 1, cipherText: 'bm90LWVuY3J5cHRlZA==' }), 'utf8')

mock.module('electron', () => ({
  app: { getPath: () => userData },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => {
      const text = value.toString('utf8')
      if (!text.startsWith('encrypted:')) throw new Error('Decryption failed')
      return text.slice('encrypted:'.length)
    }
  },
  shell: { openExternal: async () => undefined }
}))

const { applyChatRetention, previewChatRetention } = await import('../src/main/chat-history')
const { getSettings } = await import('../src/main/store')

afterAll(() => rmSync(userData, { recursive: true, force: true }))

describe('applying a retention policy', () => {
  test('never saves a policy it could not carry out', () => {
    const originalHistory = readFileSync(historyPath, 'utf8')

    // An unreadable store looks empty. Reporting zero and saving the policy
    // anyway would delete these chats at the next launch, unannounced.
    expect(() => previewChatRetention('24-hours')).toThrow()
    expect(() => applyChatRetention('24-hours')).toThrow()

    expect(getSettings().chatRetention).toBe('forever')
    expect(readFileSync(historyPath, 'utf8')).toBe(originalHistory)
  })
})

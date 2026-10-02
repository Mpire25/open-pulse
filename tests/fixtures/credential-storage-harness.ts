import { expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const directory = mkdtempSync(join(tmpdir(), 'openpulse-credential-storage-'))
let available = true,
  attempts = 0,
  fail = false
mock.module('electron', () => ({
  app: { getPath: () => directory },
  safeStorage: {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) => {
      attempts++
      if (fail) throw new Error('mock authentication denied')
      return Buffer.from(value.split('').reverse().join(''))
    },
    decryptString: (value: Buffer) => {
      attempts++
      if (fail) throw new Error('mock invalid data')
      return value.toString().split('').reverse().join('')
    }
  }
}))
const store = await import('../../src/main/store')
test('credentials never fall back to plaintext or retry failed secure storage', () => {
  try {
    store.setSecret('test', { value: 'test-credential-sentinel' })
    expect(
      readFileSync(join(directory, 'pulse-store.json'), 'utf8')
    ).not.toContain('test-credential-sentinel')
    expect(store.getSecret('test')).toEqual({
      value: 'test-credential-sentinel'
    })
    const mode = process.env.OPENPULSE_TEST_STORAGE_MODE
    const previous = readFileSync(join(directory, 'pulse-store.json'), 'utf8')
    if (mode === 'unavailable') available = false
    else fail = true
    if (mode === 'decrypt')
      expect(() => store.getSecret('test')).toThrow('decryption failed')
    else
      expect(() =>
        store.setSecret('another', { value: 'should-not-save' })
      ).toThrow()
    const failedAttempts = attempts
    available = true
    fail = false
    expect(() => store.getSecret('test')).toThrow()
    expect(() => store.setSecret('another', {})).toThrow()
    expect(attempts).toBe(failedAttempts)
    expect(readFileSync(join(directory, 'pulse-store.json'), 'utf8')).toBe(
      previous
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

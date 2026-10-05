// Disposable settings profile; real Electron and secure storage are never accessed.
import { afterAll, expect, mock, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AssistantSettings } from '../../src/shared/types'

const directory = mkdtempSync(join(tmpdir(), 'openpulse-assistant-settings-test-'))
const path = join(directory, 'pulse-store.json')
writeFileSync(path, JSON.stringify({ settings: { assistant: { model: 'future-model', reasoningEffort: 'ultra' } }, secrets: {} }))
mock.module('electron', () => ({
  app: { getPath: () => directory },
  safeStorage: new Proxy({}, { get: () => { throw new Error('Settings must not access secure storage') } })
}))
const { getSettings, updateSettings } = await import('../../src/main/store')
afterAll(() => rmSync(directory, { recursive: true, force: true }))

test('new catalog tiers load, save, and survive a restart', async () => {
  expect(getSettings().assistant).toEqual({ model: 'future-model', reasoningEffort: 'ultra' })
  for (const reasoningEffort of ['ultra', 'new-tier', 'none']) {
    const assistant = { model: 'future-model', reasoningEffort }
    expect(updateSettings({ assistant }).assistant).toEqual(assistant)
    expect(JSON.parse(readFileSync(path, 'utf8')).settings.assistant).toEqual(assistant)
    const restarted = await import(`../../src/main/store.ts?effort=${reasoningEffort}`)
    expect(restarted.getSettings().assistant).toEqual(assistant)
  }
})

test('malformed and legacy Automatic values leave the effort unset', () => {
  for (const reasoningEffort of ['auto', '', 'bad tier', 'x'.repeat(65), 42, null, { effort: 'ultra' }]) {
    expect(updateSettings({ assistant: { model: 'future-model', reasoningEffort } as AssistantSettings }).assistant.reasoningEffort).toBeUndefined()
    expect(JSON.parse(readFileSync(path, 'utf8')).settings.assistant).not.toHaveProperty('reasoningEffort')
  }
})

test('legacy Automatic settings load with no synthetic effort', async () => {
  const persisted = JSON.parse(readFileSync(path, 'utf8'))
  persisted.settings.assistant.reasoningEffort = 'auto'
  writeFileSync(path, JSON.stringify(persisted))
  const restarted = await import('../../src/main/store.ts?legacy-effort')
  expect(restarted.getSettings().assistant.reasoningEffort).toBeUndefined()
})

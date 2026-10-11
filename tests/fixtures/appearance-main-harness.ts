// Disposable profile and fake native theme. Never opens Electron or credential storage.
import { afterAll, beforeEach, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AppearanceMode, AppearanceState } from '../../src/shared/appearance'

const directory = fs.mkdtempSync(join(tmpdir(), 'openpulse-appearance-'))
const path = join(directory, 'pulse-store.json')
// Nonempty fake encrypted credentials detect accidental reads through getSettings().
fs.writeFileSync(path, JSON.stringify({ settings: { goals: { steps: 9000 } }, secrets: { 'google-client-secret': 'synthetic-encrypted-value' } }))
const rename = fs.renameSync
let failSave = false
mock.module('node:fs', () => ({ ...fs, renameSync: (...args: Parameters<typeof rename>) => {
  if (failSave) throw new Error('Synthetic disk write failure')
  return rename(...args)
} }))

let source: AppearanceMode = 'system'
let systemDark = false
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
const nativeTheme = new EventEmitter() as EventEmitter & { themeSource: AppearanceMode; shouldUseDarkColors: boolean }
Object.defineProperties(nativeTheme, {
  themeSource: { get: () => source, set: (value: AppearanceMode) => { source = value; nativeTheme.emit('updated') } },
  shouldUseDarkColors: { get: () => source === 'system' ? systemDark : source === 'dark' }
})
mock.module('electron', () => ({
  nativeTheme,
  app: { getPath: () => directory, once: () => {} },
  ipcMain: { handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => handlers.set(channel, handler) },
  BrowserWindow: {}, Menu: {}, shell: {},
  safeStorage: new Proxy({}, { get: () => { throw new Error('Appearance must not access secure storage') } })
}))
const store = await import('../../src/main/store')
const { getAppearanceState, initializeAppearance, setAppearanceMode } = await import('../../src/main/appearance')
const events: AppearanceState[] = []
const stop = initializeAppearance((state) => events.push(state))
const initial = getAppearanceState()

beforeEach(() => { failSave = false; systemDark = false; setAppearanceMode('dark'); events.length = 0 })
afterAll(() => { stop(); fs.rmSync(directory, { recursive: true, force: true }) })

test('legacy preferences start dark even on a light OS', () => {
  expect(initial).toEqual({ mode: 'dark', resolved: 'dark' })
  expect(store.getAppearancePreference()).toBe('dark')
  expect(getAppearanceState()).toEqual({ mode: 'dark', resolved: 'dark' })
})

test('all modes survive a restart without touching credentials or other settings', async () => {
  for (const mode of ['light', 'dark', 'system'] as const) {
    setAppearanceMode(mode)
    const persisted = JSON.parse(fs.readFileSync(path, 'utf8'))
    expect(persisted.settings.appearance).toBe(mode)
    expect(persisted.settings.goals.steps).toBe(9000)
    expect(persisted.secrets).toEqual({ 'google-client-secret': 'synthetic-encrypted-value' })
    const restarted = await import(`../../src/main/store.ts?appearance=${mode}`)
    expect(restarted.getAppearancePreference()).toBe(mode)
  }
})

test('system mode follows OS changes; explicit modes remain fixed', () => {
  expect(setAppearanceMode('system')).toEqual({ mode: 'system', resolved: 'light' })
  systemDark = true
  nativeTheme.emit('updated')
  expect(events).toEqual([{ mode: 'system', resolved: 'light' }, { mode: 'system', resolved: 'dark' }])
  setAppearanceMode('light')
  events.length = 0
  systemDark = false
  nativeTheme.emit('updated')
  systemDark = true
  nativeTheme.emit('updated')
  expect(getAppearanceState()).toEqual({ mode: 'light', resolved: 'light' })
  expect(events).toEqual([])
})

test('switching dark to system broadcasts even when the resolved color stays dark', () => {
  systemDark = true
  setAppearanceMode('system')
  expect(events).toEqual([{ mode: 'system', resolved: 'dark' }])
})

test('failed saves retain persisted, cached, and native appearance and emit nothing', () => {
  const saved = fs.readFileSync(path, 'utf8')
  failSave = true
  expect(() => setAppearanceMode('light')).toThrow('Synthetic disk write failure')
  expect(store.getAppearancePreference()).toBe('dark')
  expect(nativeTheme.themeSource).toBe('dark')
  expect(fs.readFileSync(path, 'utf8')).toBe(saved)
  expect(events).toEqual([])
})

test('invalid IPC values are rejected; invalid stored values normalize to dark', async () => {
  for (const invalid of ['automatic', '', null, 42, {}, ['light']]) {
    expect(() => setAppearanceMode(invalid)).toThrow('Unknown appearance mode')
    const persisted = JSON.parse(fs.readFileSync(path, 'utf8'))
    persisted.settings.appearance = invalid
    fs.writeFileSync(path, JSON.stringify(persisted))
    const restarted = await import(`../../src/main/store.ts?invalid=${JSON.stringify(invalid)}`)
    expect(restarted.getAppearancePreference()).toBe('dark')
  }
})

test('trusted appearance IPC synchronizes both windows, including a hidden popup', async () => {
  const { broadcastAppearance, registerIpc, registerTrustedRenderer } = await import('../../src/main/ipc')
  class Renderer extends EventEmitter {
    mainFrame: { frameTreeNodeId: number }
    messages: Array<[string, unknown]> = []
    url: string
    destroyed = false
    constructor(readonly id: number) {
      super()
      this.mainFrame = { frameTreeNodeId: id }
      this.url = `file:///openpulse/index.html${id === 2 ? '#menu-bar' : ''}`
    }
    getURL() { return this.url }
    isDestroyed() { return this.destroyed }
    send(channel: string, value: unknown) { this.messages.push([channel, value]) }
  }
  const main = new Renderer(1)
  const popup = new Renderer(2)
  const unrelated = new Renderer(3)
  unrelated.url = 'https://example.invalid'
  for (const renderer of [main, popup, unrelated]) {
    registerTrustedRenderer(renderer as never, (url) => url.startsWith('file:///openpulse/index.html'))
  }
  stop()
  const stopIpcAppearance = initializeAppearance(broadcastAppearance)
  registerIpc({ open: () => {}, close: () => {}, resizePanel: () => {}, quit: () => {}, settingsChanged: () => {}, notifications: { clearSender: () => {} } as never })
  const event = { sender: main, senderFrame: { frameTreeNodeId: 1, url: main.url } }
  try {
    expect(handlers.get('appearance:get')!(event)).toEqual({ mode: 'dark', resolved: 'dark' })
    expect(handlers.get('appearance:set')!(event, 'light')).toEqual({ mode: 'light', resolved: 'light' })
    for (const renderer of [main, popup]) {
      expect(renderer.messages.filter(([channel]) => channel === 'appearance:changed')).toEqual([
        ['appearance:changed', { mode: 'light', resolved: 'light' }]
      ])
    }
    expect(unrelated.messages).toEqual([])
    handlers.get('appearance:set')!(event, 'system')
    systemDark = true
    nativeTheme.emit('updated')
    expect(popup.messages.at(-1)).toEqual(['appearance:changed', { mode: 'system', resolved: 'dark' }])
    // Reopening a popup can read the current value without relying on an earlier event.
    expect(handlers.get('appearance:get')!({ sender: popup, senderFrame: { frameTreeNodeId: 2, url: popup.url } })).toEqual({ mode: 'system', resolved: 'dark' })
    expect(() => handlers.get('appearance:set')!({ sender: unrelated, senderFrame: { frameTreeNodeId: 3, url: unrelated.url } }, 'light')).toThrow('Unauthorized IPC sender')
    expect(getAppearanceState()).toEqual({ mode: 'system', resolved: 'dark' })
  } finally {
    stopIpcAppearance()
    for (const renderer of [main, popup, unrelated]) renderer.emit('destroyed')
  }
})

// Synthetic Electron transport only; never opens the OS notification UI or Keychain.
import { afterAll, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const directory = mkdtempSync(join(tmpdir(), 'openpulse-response-notifications-'))
const path = join(directory, 'pulse-store.json')
writeFileSync(path, JSON.stringify({ settings: {}, secrets: { 'google-client-secret': 'synthetic-encrypted-data' } }))
let credentialCalls = 0
let focused = true
let visible = true
let minimized = false
let supported = true
const notifications: FakeNotification[] = []
class FakeNotification extends EventEmitter {
  static isSupported = () => supported
  shown = false
  closed = false
  constructor(readonly options: Record<string, unknown>) { super(); notifications.push(this) }
  show() { this.shown = true }
  close() { this.closed = true }
}
mock.module('electron', () => ({
  app: { getPath: () => directory },
  safeStorage: {
    isEncryptionAvailable: () => { credentialCalls++; throw new Error('Notification code must not access credentials') },
    decryptString: () => { credentialCalls++; throw new Error('Notification code must not decrypt credentials') }
  },
  Notification: FakeNotification,
  webContents: { fromId: (id: number) => id === 1 ? {} : null },
  BrowserWindow: { fromWebContents: () => ({
    isDestroyed: () => false, isFocused: () => focused, isVisible: () => visible, isMinimized: () => minimized
  }) }
}))

let store = await import('../../src/main/store')
test('legacy settings default to disabled without touching encrypted credentials', async () => {
  expect(store.getResponseNotificationPreferences()).toEqual({ enabled: false, sound: false, previews: false })
  expect(credentialCalls).toBe(0)
  writeFileSync(path, JSON.stringify({
    settings: { responseNotificationsEnabled: true, responseNotificationSound: false },
    secrets: { 'google-client-secret': 'synthetic-encrypted-data' }
  }))
  // A fresh module simulates restart and loads the saved preference.
  store = await import('../../src/main/store?notification-preference-restart')
  expect(store.getResponseNotificationPreferences()).toEqual({ enabled: true, sound: false, previews: false })
  expect(credentialCalls).toBe(0)
  writeFileSync(path, JSON.stringify({
    settings: { responseNotificationsEnabled: true, responseNotificationPreviews: true },
    secrets: { 'google-client-secret': 'synthetic-encrypted-data' }
  }))
  store = await import('../../src/main/store?notification-preview-restart')
  expect(store.getResponseNotificationPreferences()).toEqual({ enabled: true, sound: false, previews: true })
  expect(credentialCalls).toBe(0)
})

test('Electron adapter suppresses only focused visible windows, handles clicks and failures safely', async () => {
  const readPreferences = store.getResponseNotificationPreferences
  mock.module('../../src/main/store', () => ({ getResponseNotificationPreferences: readPreferences }))
  const { createResponseNotifications } = await import('../../src/main/response-notifications')
  const opened: Array<[number, string]> = []
  const controller = createResponseNotifications((senderId, chatId) => { opened.push([senderId, chatId]) })
  const complete = (runId: string) => {
    controller.observe(1, { type: 'done', outcome: 'completed', chatId: 'chat-a', runId, text: 'Private details', parts: [] })
    controller.acknowledge(1, 'chat-a', runId)
  }
  controller.setVisibleChat(1, 'chat-a')
  complete('focused')
  expect(notifications).toHaveLength(0)
  minimized = true
  complete('minimized')
  minimized = false; visible = false
  complete('hidden')
  visible = true; focused = false
  complete('background')
  expect(notifications).toHaveLength(3)
  expect(notifications.every((notification) => notification.shown)).toBe(true)
  expect(notifications[0].options).toEqual({ title: 'OpenPulse', body: 'Your AI response is ready.', silent: true, groupId: 'openpulse-chat-chat-a' })
  notifications[0].emit('click')
  expect(opened).toEqual([[1, 'chat-a']])
  expect(notifications[0].closed).toBe(true)
  notifications[1].emit('failed')
  notifications[1].emit('click')
  expect(opened).toHaveLength(1)
  supported = false
  complete('unsupported')
  expect(notifications).toHaveLength(3)
  supported = true
  controller.observe(1, { type: 'done', outcome: 'completed', chatId: 'chat-a', runId: 'preview', text: 'Interim commentary and final answer', parts: [] }, {
    query: 'How did I sleep?', text: '**Seven hours** last night.'
  })
  controller.acknowledge(1, 'chat-a', 'preview')
  expect(notifications[3].options).toEqual({ title: 'How did I sleep?', body: 'Seven hours last night.', silent: true, groupId: 'openpulse-chat-chat-a' })
  expect(notifications[3].shown).toBe(true)
  controller.clearPreviews()
  expect(notifications[3].closed).toBe(true)
  expect(notifications[2].closed).toBe(false)
  controller.clear()
  expect(notifications[2].closed).toBe(true)
  expect(credentialCalls).toBe(0)
})
afterAll(() => rmSync(directory, { recursive: true, force: true }))

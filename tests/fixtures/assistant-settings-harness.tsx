// DOM-only renderer tests: no Electron process, real accounts, or credential storage.
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act, useState } from 'react'
import * as framerMotion from 'framer-motion'
import { DEFAULT_ASSISTANT, DEFAULT_GOALS, type AppSettings, type CodexAuthStatus } from '../../src/shared/types'

const dom = new Window({ url: 'http://localhost:49173' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'Document', 'HTMLInputElement', 'HTMLFormElement', 'HTMLButtonElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// Animation is unrelated to account state; use plain elements to keep this harness deterministic.
const motionExports = { ...framerMotion }
mock.module('framer-motion', () => ({ ...motionExports, motion: new Proxy({}, { get: (_, tag: string) => React.forwardRef((props: Record<string, unknown>, ref) => {
  const { initial, animate, transition, layoutId, layout, whileHover, whileTap, exit, ...rest } = props
  return React.createElement(tag, { ...rest, ref })
}) }), AnimatePresence: ({ children }: { children: React.ReactNode }) => children }))
const { createRoot } = await import('react-dom/client')
const { SettingsView } = await import('../../src/renderer/src/views/SettingsView')
const settings: AppSettings = { menuBarEnabled: false, responseNotificationsEnabled: false, responseNotificationSound: false, responseNotificationPreviews: false, googleClientId: '', googleClientSecret: '', googleClientSecretConfigured: false, goals: DEFAULT_GOALS, assistant: DEFAULT_ASSISTANT, chatRetention: 'forever' }
const connected: CodexAuthStatus = { connected: true, signedIn: true, planEnabled: true, activeRegistration: 'account-a', authRevision: 1, email: 'test@example.invalid' }
let backendStatus: CodexAuthStatus
let publish!: (value: CodexAuthStatus) => void
let resolveConnect!: (value: CodexAuthStatus) => void
let disconnects = 0
let modelRequests = 0
let modelResult: unknown
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement

function Harness(): React.JSX.Element {
  const [status, setStatus] = useState(backendStatus)
  const [preferences, setPreferences] = useState(settings)
  publish = setStatus
  return <SettingsView settings={preferences} google={{ connected: true }} codex={status} onSettingsChange={setPreferences} onGoogleChange={() => {}} onCodexChange={setStatus} />
}
function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === label)
}

test('notification preferences start disabled, save independently, and keep sound and previews opt-in', async () => {
  const patches: Partial<AppSettings>[] = []
  let saved = { ...settings }
  window.pulse.settings.update = async (patch) => {
    patches.push(patch)
    saved = { ...saved, ...patch }
    return saved
  }
  await act(async () => root.render(<Harness />))
  const enabled = () => document.getElementById('response-notifications-enabled') as HTMLButtonElement
  const sound = () => document.getElementById('response-notification-sound') as HTMLButtonElement
  const previews = () => document.getElementById('response-notification-previews') as HTMLButtonElement
  expect(enabled().getAttribute('aria-checked')).toBe('false')
  expect(sound().disabled).toBe(true)
  expect(previews().disabled).toBe(true)
  expect(previews().getAttribute('aria-checked')).toBe('false')
  await act(async () => enabled().click())
  expect(enabled().getAttribute('aria-checked')).toBe('true')
  expect(sound().getAttribute('aria-checked')).toBe('false')
  expect(sound().disabled).toBe(false)
  expect(previews().disabled).toBe(false)
  expect(previews().getAttribute('aria-checked')).toBe('false')
  expect(document.getElementById('response-notification-previews-description')?.textContent).toContain('health information')
  await act(async () => sound().click())
  expect(sound().getAttribute('aria-checked')).toBe('true')
  await act(async () => previews().click())
  expect(previews().getAttribute('aria-checked')).toBe('true')
  expect(patches).toEqual([{ responseNotificationsEnabled: true }, { responseNotificationSound: true }, { responseNotificationPreviews: true }])
})

test('failed notification preference save leaves the switch unchanged and reports the failure', async () => {
  window.pulse.settings.update = async () => { throw new Error('Synthetic disk write failure') }
  await act(async () => root.render(<Harness />))
  const enabled = document.getElementById('response-notifications-enabled') as HTMLButtonElement
  await act(async () => enabled.click())
  expect(enabled.getAttribute('aria-checked')).toBe('false')
  expect(enabled.disabled).toBe(false)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not save the notification preference')
})
beforeEach(() => {
  backendStatus = { connected: false }; disconnects = 0; modelRequests = 0
  modelResult = { models: [{ id: 'future-model', label: 'Future Model', efforts: ['auto', 'low'] }], stale: false }
  Object.assign(dom, { pulse: {
    app: { platform: 'linux' }, settings: { update: async () => settings },
    codex: {
      connect: () => new Promise<CodexAuthStatus>((resolve) => { resolveConnect = resolve }),
      disconnect: async () => { disconnects++; backendStatus = { connected: false }; return {} },
      status: async () => backendStatus,
      models: async () => { modelRequests++; return modelResult }
    }
  } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterAll(async () => { await dom.happyDOM.close() })
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

test('sign out is usable immediately after connecting on the same settings page', async () => {
  await act(async () => root.render(<Harness />))
  await act(async () => button('Sign in with ChatGPT')!.click())
  await act(async () => { backendStatus = connected; resolveConnect(connected) })
  expect(button('Sign out')?.disabled).toBe(false)
  expect(Boolean(button('Continue with account'))).toBe(false)
  await act(async () => button('Sign out')!.click())
  expect(disconnects).toBe(1)
  expect(Boolean(button('Sign in with ChatGPT'))).toBe(true)
})

test('a stale sign-in completion cannot disable sign out or reconnect after signing out', async () => {
  await act(async () => root.render(<Harness />))
  await act(async () => button('Sign in with ChatGPT')!.click())
  await act(async () => { backendStatus = connected; publish(connected) })
  expect(button('Sign out')?.disabled).toBe(false)
  await act(async () => button('Sign out')!.click())
  await act(async () => resolveConnect(connected))
  expect(Boolean(button('Sign out'))).toBe(false)
  expect(button('Sign in with ChatGPT')?.disabled).toBe(false)
})

test('sign-in delegates account selection to ChatGPT', async () => {
  backendStatus = { connected: false, signedIn: false }
  let signInArguments: unknown[] = []
  window.pulse.codex.connect = async (...args) => { signInArguments = args; return connected }
  await act(async () => root.render(<Harness />))
  expect(Boolean(document.querySelector('select[aria-label="ChatGPT account"]'))).toBe(false)
  expect(document.body.textContent?.includes('Test account')).toBe(false)
  expect(document.body.textContent?.includes('test@example.invalid')).toBe(false)
  await act(async () => button('Sign in with ChatGPT')!.click())
  expect(signInArguments.length).toBe(0)
  expect(Boolean(button('Sign out'))).toBe(true)
  expect(Boolean(button('Switch account'))).toBe(false)
  expect(Boolean(document.querySelector('select[aria-label="ChatGPT account"]'))).toBe(false)
  expect(Boolean(button('Sign in with ChatGPT'))).toBe(false)
})

test('sign-in without plan authorization only offers sign out', async () => {
  backendStatus = { ...connected, connected: false, planEnabled: false }
  await act(async () => root.render(<Harness />))
  expect(Boolean(button('Sign out'))).toBe(true)
  expect(Boolean(button('Enable plan usage'))).toBe(false)
  expect(Boolean(button('Switch account'))).toBe(false)
  expect(document.body.textContent?.includes('Sign out and sign in again')).toBe(true)
})

test('failed sign-in restores the button and displays the error', async () => {
  window.pulse.codex.connect = async () => { throw new Error('Authorization canceled') }
  await act(async () => root.render(<Harness />))
  await act(async () => button('Sign in with ChatGPT')!.click())
  expect(button('Sign in with ChatGPT')?.disabled).toBe(false)
  expect(document.body.textContent?.includes('Authorization canceled')).toBe(true)
})

test('disconnected model card explains the next step without incomplete controls', async () => {
  await act(async () => root.render(<Harness />))
  expect(document.body.textContent?.includes('Connect your ChatGPT account above')).toBe(true)
  expect(Boolean(button('Custom…'))).toBe(false)
  expect(Boolean(button('Automatic'))).toBe(false)
  expect(Boolean(button('Refresh models'))).toBe(false)
  expect(document.body.textContent?.includes('Saved selection:')).toBe(false)
  expect(modelRequests).toBe(0)
})

test('model controls appear after the account catalog loads', async () => {
  backendStatus = connected
  let complete!: (value: unknown) => void
  window.pulse.codex.models = () => new Promise((resolve) => { complete = resolve }) as ReturnType<typeof window.pulse.codex.models>
  await act(async () => root.render(<Harness />))
  expect(document.body.textContent?.includes('Loading models available')).toBe(true)
  expect(Boolean(button('Custom…'))).toBe(false)
  expect(document.body.textContent?.includes('Saved effort:')).toBe(false)
  await act(async () => complete(modelResult))
  expect(Boolean(button('Future Model'))).toBe(true)
  expect(Boolean(button('Refresh models'))).toBe(true)
  await act(async () => { backendStatus = { connected: false }; publish(backendStatus) })
  expect(Boolean(button('Future Model'))).toBe(false)
})

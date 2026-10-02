// DOM-only renderer tests: no Electron process, real accounts, or credential storage.
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act, useState } from 'react'
import { DEFAULT_ASSISTANT, DEFAULT_GOALS, type AppSettings, type CodexAuthStatus } from '../../src/shared/types'

const dom = new Window({ url: 'http://localhost:49173' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'Document', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// Animation is unrelated to account state; use plain elements to keep this harness deterministic.
mock.module('framer-motion', () => ({ motion: new Proxy({}, { get: (_, tag: string) => React.forwardRef((props: Record<string, unknown>, ref) => {
  const { initial, animate, transition, layoutId, layout, whileHover, whileTap, exit, ...rest } = props
  return React.createElement(tag, { ...rest, ref })
}) }), AnimatePresence: ({ children }: { children: React.ReactNode }) => children }))
const { createRoot } = await import('react-dom/client')
const { SettingsView } = await import('../../src/renderer/src/views/SettingsView')
const settings: AppSettings = { menuBarEnabled: false, googleClientId: '', googleClientSecret: '', googleClientSecretConfigured: false, goals: DEFAULT_GOALS, assistant: DEFAULT_ASSISTANT, chatRetention: 'forever' }
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
  publish = setStatus
  return <SettingsView settings={settings} google={{ connected: true }} codex={status} onSettingsChange={() => {}} onGoogleChange={() => {}} onCodexChange={setStatus} />
}
function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((element) => element.textContent?.trim() === label)
}
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

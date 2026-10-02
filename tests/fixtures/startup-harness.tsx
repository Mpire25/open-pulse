// DOM-only renderer tests: no Electron process, real accounts, or credential storage.
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act } from 'react'

const dom = new Window({ url: 'http://localhost:49173' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'Document', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'Event', 'MouseEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const client = new QueryClient()
const { default: App } = await import('../../src/renderer/src/App')
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
let reads: Record<string, number>
let failing: string
const failure = 'Secure credential storage decryption failed. OpenPulse will not retry this session.'
beforeEach(() => {
  reads = { settings: 0, google: 0, codex: 0, chats: 0, models: 0 }
  const status = (name: string) => async () => { reads[name]++; if (failing === name) throw new Error(failure); return { connected: false } }
  Object.assign(dom, { pulse: {
    app: { onNewChat: () => () => {}, onNavigate: () => () => {} },
    settings: { get: status('settings') },
    google: { status: status('google'), onStatusChanged: () => () => {} },
    codex: { status: status('codex'), models: status('models') },
    chats: { list: status('chats'), onAccountChanged: () => () => {}, onTitleChanged: () => () => {} },
    ai: { onEvent: () => () => {} }
  } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
afterAll(async () => { await dom.happyDOM.close() })
for (const name of ['settings', 'google', 'codex']) {
  test(`${name} startup rejection displays recovery instructions without retrying`, async () => {
    failing = name
    await act(async () => root.render(<QueryClientProvider client={client}><App /></QueryClientProvider>))
    expect(document.querySelector('[role="alert"]')?.textContent?.includes(failure)).toBe(true)
    expect(document.body.textContent?.includes('Quit and reopen OpenPulse')).toBe(true)
    expect(document.querySelectorAll('button').length).toBe(0)
    await act(async () => root.render(<QueryClientProvider client={client}><App /></QueryClientProvider>))
    expect(reads).toEqual({ settings: 1, google: 1, codex: 1, chats: 0, models: 0 })
  })
}

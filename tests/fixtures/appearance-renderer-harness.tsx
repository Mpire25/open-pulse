// DOM-only appearance tests with mocked IPC. No native apps or accounts.
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act } from 'react'
import type { AppearanceMode, AppearanceState } from '../../src/shared/appearance'

const dom = new Window({ url: 'http://localhost:49173' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'HTMLInputElement', 'Event', 'MouseEvent']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const { AppearanceCard } = await import('../../src/renderer/src/components/AppearanceCard')
const { initializeAppearance } = await import('../../src/renderer/src/lib/appearance')
const callbacks = new Set<(state: AppearanceState) => void>()
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
let stop: () => void
let saved: AppearanceState
let writes: AppearanceMode[]

function publish(state: AppearanceState): void {
  saved = state
  for (const callback of callbacks) callback(state)
}
function input(value: AppearanceMode): HTMLInputElement {
  return document.querySelector(`input[name="appearance"][value="${value}"]`)!
}

beforeEach(async () => {
  saved = { mode: 'dark', resolved: 'dark' }
  writes = []
  Object.assign(dom, { pulse: { appearance: {
    get: async () => saved,
    set: async (mode: AppearanceMode) => {
      writes.push(mode)
      publish({ mode, resolved: mode === 'system' ? 'light' : mode })
      return saved
    },
    onChanged: (callback: (state: AppearanceState) => void) => {
      callbacks.add(callback)
      return () => callbacks.delete(callback)
    }
  } } })
  stop = await initializeAppearance()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<AppearanceCard />))
})
afterEach(async () => { stop(); await act(async () => root.unmount()); container.remove(); callbacks.clear() })
afterAll(async () => { await dom.happyDOM.close() })

test('accessible radio options save and update the document theme immediately', async () => {
  expect(document.querySelector('legend')?.textContent).toBe('Color mode')
  expect(input('dark').checked).toBe(true)
  await act(async () => input('light').click())
  expect(writes).toEqual(['light'])
  expect(input('light').checked).toBe(true)
  expect(document.documentElement.dataset.appearance).toBe('light')
  expect(document.documentElement.style.colorScheme).toBe('light')
  await act(async () => input('system').click())
  expect(input('system').checked).toBe(true)
  expect(document.getElementById('appearance-description')?.textContent).toContain('Currently using light mode')
})

test('OS and other-window broadcasts update selection and colors without saving again', async () => {
  await act(async () => publish({ mode: 'system', resolved: 'light' }))
  expect(input('system').checked).toBe(true)
  await act(async () => publish({ mode: 'system', resolved: 'dark' }))
  expect(input('system').checked).toBe(true)
  expect(document.documentElement.dataset.appearance).toBe('dark')
  expect(document.getElementById('appearance-description')?.textContent).toContain('Currently using dark mode')
  await act(async () => publish({ mode: 'light', resolved: 'light' }))
  expect(input('light').checked).toBe(true)
  expect(writes).toEqual([])
})

test('failed saves retain the last selection and colors and show a retryable error', async () => {
  window.pulse.appearance.set = async () => { throw new Error('Synthetic disk write failure') }
  await act(async () => input('light').click())
  expect(input('dark').checked).toBe(true)
  expect(document.documentElement.dataset.appearance).toBe('dark')
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Could not save your appearance')
  expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false)
})

test('an in-flight save disables the group and changes colors only after success', async () => {
  let finish!: (state: AppearanceState) => void
  window.pulse.appearance.set = () => new Promise((resolve) => { finish = resolve })
  await act(async () => input('light').click())
  expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true)
  expect(document.documentElement.dataset.appearance).toBe('dark')
  await act(async () => finish({ mode: 'light', resolved: 'light' }))
  expect(input('light').checked).toBe(true)
  expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(false)
})

test('saving restores radio focus lost to disabling, without stealing focus from another control', async () => {
  let finish!: (state: AppearanceState) => void
  window.pulse.appearance.set = () => new Promise((resolve) => { finish = resolve })
  input('light').focus()
  await act(async () => input('light').click())
  input('light').blur() // Model Chromium dropping focus when the fieldset is disabled.
  await act(async () => finish({ mode: 'light', resolved: 'light' }))
  expect(document.activeElement).toBe(input('light'))

  const other = document.createElement('button')
  container.append(other)
  input('dark').focus()
  await act(async () => input('dark').click())
  other.focus()
  await act(async () => finish({ mode: 'dark', resolved: 'dark' }))
  expect(document.activeElement).toBe(other)
})

test('a delayed startup read cannot overwrite a newer broadcast', async () => {
  stop()
  let finish!: (state: AppearanceState) => void
  window.pulse.appearance.get = () => new Promise((resolve) => { finish = resolve })
  const initializing = initializeAppearance()
  await act(async () => {
    publish({ mode: 'light', resolved: 'light' })
    finish({ mode: 'dark', resolved: 'dark' })
    stop = await initializing
  })
  expect(input('light').checked).toBe(true)
  expect(document.documentElement.dataset.appearance).toBe('light')
})

test('a delayed save response cannot overwrite a newer broadcast', async () => {
  let finish!: (state: AppearanceState) => void
  window.pulse.appearance.set = () => new Promise((resolve) => { finish = resolve })
  await act(async () => input('light').click())
  await act(async () => {
    publish({ mode: 'light', resolved: 'light' })
    publish({ mode: 'system', resolved: 'dark' })
    finish({ mode: 'light', resolved: 'light' })
  })
  expect(input('system').checked).toBe(true)
  expect(document.documentElement.dataset.appearance).toBe('dark')
})

test('initialization failures remove the event listener', async () => {
  stop()
  window.pulse.appearance.get = async () => { throw new Error('Synthetic IPC failure') }
  await expect(initializeAppearance()).rejects.toThrow('Synthetic IPC failure')
  expect(callbacks.size).toBe(0)
})

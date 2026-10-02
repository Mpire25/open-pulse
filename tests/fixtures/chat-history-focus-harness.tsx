// DOM-only tests with synthetic chats; no Electron, accounts, or credential storage.
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act, useState } from 'react'
import type { ChatController } from '../../src/renderer/src/hooks/useChat'
import type { ChatSession } from '../../src/shared/types'

const dom = new Window({ url: 'http://localhost:49173' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'SVGElement', 'Document', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
// Exercise focus and timers without happy-dom's incomplete native animations.
Object.defineProperty(dom.Element.prototype, 'animate', { configurable: true, value: undefined })
const { createRoot } = await import('react-dom/client')
const { ChatHistory } = await import('../../src/renderer/src/components/ChatHistory')
const { AssistantView } = await import('../../src/renderer/src/views/AssistantView')
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
let deletions: string[]

function Harness({ full = false }: { full?: boolean }) {
  const [sessions, setSessions] = useState<ChatSession[]>(['Alpha', 'Beta'].map((title, i) => ({ id: String(i), title, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messages: [] })))
  const chat: ChatController = {
    sessions, activeChatId: '0', turns: [], busy: false, loading: false, streamingChatIds: [],
    select: () => {}, send: () => {}, stop: () => {}, create: async () => {}, pin: async () => {}, keep: async () => {}, refresh: async () => {}, reload: async () => {},
    delete: async id => { deletions.push(id); setSessions(current => current.filter(session => session.id !== id)) }
  }
  return full
    ? <AssistantView chat={chat} composerDraft="" setComposerDraft={() => {}} codex={{ connected: false }} composerFocusRequest={0} onOpenSettings={() => {}} onAssistantAction={() => {}} />
    : <ChatHistory chat={chat} />
}

function button(name: string): HTMLButtonElement {
  const result = [...document.querySelectorAll('button')].find(candidate => candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name)
  if (!result) throw new Error(`Missing button: ${name}`)
  return result
}

const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
async function openDelete(name = 'Delete Alpha') {
  const trigger = button(name)
  await act(async () => { trigger.focus(); trigger.click() })
  await settle()
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(document.activeElement).toBe(button('Cancel'))
  return trigger
}

beforeEach(() => {
  deletions = []
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); await settle(); container.remove() })
afterAll(async () => { await dom.happyDOM.close() })

test('Cancel restores focus to the row Delete button without deleting', async () => {
  await act(async () => root.render(<Harness />))
  const trigger = await openDelete()
  await act(async () => button('Cancel').click())
  await settle()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(deletions).toEqual([])
})

test('Escape restores focus to the row Delete button', async () => {
  await act(async () => root.render(<Harness />))
  const trigger = await openDelete()
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
  await settle()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(trigger)
  expect(deletions).toEqual([])
})

test('confirming deletion focuses a remaining chat', async () => {
  await act(async () => root.render(<Harness />))
  await openDelete()
  await act(async () => button('Delete').click())
  await settle()
  expect(deletions).toEqual(['0'])
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(button('Beta'))
})

test('deleting the final chat keeps focus in the empty history', async () => {
  await act(async () => root.render(<Harness />))
  for (const name of ['Delete Alpha', 'Delete Beta']) {
    await openDelete(name)
    await act(async () => button('Delete').click())
    await settle()
  }
  expect(deletions).toEqual(['0', '1'])
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(document.activeElement).toBe(container.firstElementChild)
  expect(document.body.textContent).toContain('will appear here')
})

for (const close of ['Cancel', 'Escape']) {
  test(`full Assistant keeps history open and restores focus on ${close}`, async () => {
    await act(async () => root.render(<Harness full />))
    await act(async () => button('Conversation history').click())
    await settle()
    const trigger = await openDelete()
    // Moving to the portal must not let the history's hover timer remove it.
    await act(async () => {
      container.querySelector('aside')!.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: button('Cancel') }))
      await new Promise(resolve => setTimeout(resolve, 350))
    })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => {
      if (close === 'Cancel') button('Cancel').click()
      else document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })
    await settle()
    expect(button('Conversation history').getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(trigger)
    expect(deletions).toEqual([])
  })
}

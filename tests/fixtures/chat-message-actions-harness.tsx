// Real chat hook in a synthetic DOM, with in-memory sessions and no credentials.
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act, useState } from 'react'
import * as framerMotion from 'framer-motion'
import type { AiEvent, ChatMessage, ChatSession, ChatSessionMessage } from '../../src/shared/types'
import type { ChatController } from '../../src/renderer/src/hooks/useChat'

const dom = new Window({ url: 'http://localhost:49173' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Document', 'SVGElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const motionExports = { ...framerMotion }
mock.module('framer-motion', () => ({ ...motionExports, motion: new Proxy({}, { get: (_, tag: string) => tag === 'create' ? (component: React.ComponentType) => component : React.forwardRef((props: Record<string, unknown>, ref) => {
  const { initial, animate, transition, exit, ...rest } = props
  return React.createElement(tag, { ...rest, ref })
}) }), AnimatePresence: ({ children }: { children: React.ReactNode }) => children }))
const { ChatPanel } = await import('../../src/renderer/src/components/ChatPanel')
const { createRoot } = await import('react-dom/client')
const { useChat } = await import('../../src/renderer/src/hooks/useChat')
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
let chat: ChatController
let receive: (event: AiEvent) => void
let accountChanged: () => void
let sends: Array<[string, string]>
let ready: Array<[string, string]>
let histories: ChatMessage[][]
let sessions: Map<string, ChatSession>
let failPersistence: boolean
const now = new Date().toISOString()
function session(id: string): ChatSession {
  return { id, title: id, createdAt: now, updatedAt: now, messages: [] }
}
function Harness() {
  chat = useChat()
  const [draft, setDraft] = useState('')
  return <ChatPanel chat={chat} draft={draft} setDraft={setDraft} codexConnected onOpenSettings={() => {}} onAssistantAction={() => {}} />
}
beforeEach(async () => {
  sends = []; ready = []; histories = []; failPersistence = false
  sessions = new Map(['chat-a', 'chat-b'].map((id) => [id, session(id)]))
  Object.assign(dom, { pulse: {
    chats: {
      list: async () => ({ sessions: [...sessions.values()], persistence: 'memory' }),
      update: async (id: string, messages: ChatSessionMessage[]) => {
        if (failPersistence) throw new Error('Synthetic history write failure')
        const value = { ...sessions.get(id)!, messages }; sessions.set(id, value); return value
      },
      onAccountChanged: (callback: () => void) => { accountChanged = callback; return () => {} }
    },
    ai: {
      send: async (chatId: string, runId: string, history: ChatMessage[]) => { sends.push([chatId, runId]); histories.push(history) },
      cancel: async () => {},
      responseReady: async (chatId: string, runId: string) => { ready.push([chatId, runId]) },
      onEvent: (callback: (event: AiEvent) => void) => { receive = callback; return () => {} }
    }
  } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  await act(async () => root.render(<Harness />))
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
afterAll(async () => { await dom.happyDOM.close() })

async function send() {
  await act(async () => { chat.select('chat-a'); chat.send('Analyse my steps') })
  const [chatId, runId] = sends.at(-1)!
  return { chatId, runId }
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find((element) =>
    element.getAttribute('aria-label') === label || element.textContent?.trim() === label)
}

test('retry replaces the failed response and resends the same history once', async () => {
  const ids = await send()
  const userId = chat.turns[0].id
  await act(async () => receive({ ...ids, type: 'error', message: 'Synthetic network failure' }))
  expect(button('Retry')).toBeDefined()
  await act(async () => { button('Retry')!.click(); chat.retry() })
  expect(sends).toHaveLength(2)
  expect(histories[1]).toEqual(histories[0])
  expect(chat.turns).toHaveLength(2)
  expect(chat.turns[0].id).toBe(userId)
  expect(chat.busy).toBe(true)
  expect(button('Retry')).toBeUndefined()
  await act(async () => receive({ ...ids, type: 'error', message: 'Late failure' }))
  expect(chat.busy).toBe(true)
  const [chatId, runId] = sends[1]
  await act(async () => receive({ chatId, runId, type: 'done', outcome: 'completed', text: 'Recovered answer', parts: [] }))
  expect(chat.busy).toBe(false)
  expect(sessions.get(chatId)!.messages.map((turn) => turn.text)).toEqual(['Analyse my steps', 'Recovered answer'])
})

test('IPC send rejection becomes a retryable error', async () => {
  window.pulse.ai.send = async () => { throw new Error('Synthetic IPC failure') }
  await act(async () => { chat.select('chat-a'); chat.send('Analyse my steps') })
  expect(chat.busy).toBe(false)
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Synthetic IPC failure')
  expect(button('Retry')).toBeDefined()
})

test('an older failure cannot retry after a newer request', async () => {
  const ids = await send()
  await act(async () => receive({ ...ids, type: 'error', message: 'Synthetic failure' }))
  await act(async () => chat.send('A different question'))
  const [chatId, runId] = sends[1]
  await act(async () => receive({ chatId, runId, type: 'done', outcome: 'completed', text: 'New answer', parts: [] }))
  expect(button('Retry')).toBeUndefined()
  await act(async () => chat.retry())
  expect(sends).toHaveLength(2)
})

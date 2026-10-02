// Real chat hook in a synthetic DOM, with in-memory sessions and no credentials.
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act } from 'react'
import type { AiEvent, ChatSession, ChatSessionMessage, ChatTitleUpdate } from '../../src/shared/types'
import type { ChatController } from '../../src/renderer/src/hooks/useChat'

const dom = new Window({ url: 'http://localhost:49173' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Document']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const { useChat } = await import('../../src/renderer/src/hooks/useChat')
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
let chat: ChatController
let receive: (event: AiEvent) => void
let accountChanged: () => void
let titleChanged: (title: ChatTitleUpdate) => void
let sends: Array<[string, string]>
let ready: Array<[string, string]>
let failPersistence: boolean
const now = new Date().toISOString()
function session(id: string): ChatSession {
  return { id, title: id, createdAt: now, updatedAt: now, messages: [] }
}
function Harness() {
  chat = useChat()
  return <div>{chat.turns.map((turn) => turn.text).join('\n')}</div>
}
beforeEach(async () => {
  sends = []; ready = []; failPersistence = false
  const sessions = new Map(['chat-a', 'chat-b'].map((id) => [id, session(id)]))
  Object.assign(dom, { pulse: {
    chats: {
      onTitleChanged: (callback: typeof titleChanged) => { titleChanged = callback; return () => {} },
      list: async () => ({ sessions: [...sessions.values()], persistence: 'memory' }),
      update: async (id: string, messages: ChatSessionMessage[]) => {
        if (failPersistence) throw new Error('Synthetic history write failure')
        const value = { ...sessions.get(id)!, messages }; sessions.set(id, value); return value
      },
      onAccountChanged: (callback: () => void) => { accountChanged = callback; return () => {} }
    },
    ai: {
      send: async (chatId: string, runId: string) => { sends.push([chatId, runId]) },
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

test('title updates preserve streaming text and survive a stale completion save', async () => {
  const ids = await send()
  await act(async () => receive({ ...ids, type: 'delta', text: 'Partial answer' }))
  await act(async () => titleChanged({ id: 'chat-a', title: 'Weekly steps comparison', titleGeneration: 'generated' }))
  expect(chat.sessions.find((session) => session.id === 'chat-a')?.title).toBe('Weekly steps comparison')
  expect(container.textContent).toContain('Partial answer')
  expect(chat.busy).toBe(true)
  await act(async () => receive({ ...ids, type: 'done', outcome: 'completed', text: 'Complete answer', parts: [] }))
  expect(chat.sessions.find((session) => session.id === 'chat-a')?.title).toBe('Weekly steps comparison')
  expect(container.textContent).toContain('Complete answer')
  await act(async () => titleChanged({ id: 'deleted', title: 'Late title', titleGeneration: 'generated' }))
  expect(chat.sessions.some((session) => session.id === 'deleted')).toBe(false)
})

test('accepted successful response is available and acknowledged once even if persistence fails', async () => {
  const ids = await send()
  const event: AiEvent = { ...ids, type: 'done', outcome: 'completed', text: 'Your response.', parts: [] }
  failPersistence = true
  await act(async () => receive(event))
  expect(container.textContent).toContain('Your response.')
  expect(chat.busy).toBe(false)
  expect(ready).toEqual([[ids.chatId, ids.runId]])
  await act(async () => receive(event))
  expect(ready).toHaveLength(1)
})

test('a completed background chat is acknowledged without switching the selected chat', async () => {
  const ids = await send()
  await act(async () => chat.select('chat-b'))
  await act(async () => receive({ ...ids, type: 'done', outcome: 'completed', text: 'Ready in chat A.', parts: [] }))
  expect(chat.activeChatId).toBe('chat-b')
  expect(ready).toEqual([[ids.chatId, ids.runId]])
  await act(async () => chat.select('chat-a'))
  expect(container.textContent).toContain('Ready in chat A.')
})

test('stale run IDs, stopped runs, and previous-account events are ignored', async () => {
  const ids = await send()
  await act(async () => receive({ ...ids, runId: 'stale', type: 'done', outcome: 'completed', text: 'Stale.', parts: [] }))
  expect(ready).toHaveLength(0)
  await act(async () => chat.stop())
  await act(async () => receive({ ...ids, type: 'done', outcome: 'completed', text: 'Late.', parts: [] }))
  expect(ready).toHaveLength(0)
  const newIds = await send()
  await act(async () => accountChanged())
  await act(async () => receive({ ...newIds, type: 'done', outcome: 'completed', text: 'Previous account.', parts: [] }))
  expect(ready).toHaveLength(0)
})

for (const outcome of ['tool-limit', 'error', 'interrupted'] as const) {
  test(`${outcome} terminal events never acknowledge a successful response`, async () => {
    const ids = await send()
    const event: AiEvent = outcome === 'tool-limit'
      ? { ...ids, type: 'done', outcome, text: 'Partial answer.', parts: [] }
      : { ...ids, type: outcome, message: 'Response stopped.' }
    await act(async () => receive(event))
    expect(chat.busy).toBe(false)
    expect(ready).toHaveLength(0)
  })
}

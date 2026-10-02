// Exercise real App navigation with synthetic chrome and no health/account reads.
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act, useState } from 'react'
import { DEFAULT_ASSISTANT, DEFAULT_GOALS } from '../../src/shared/types'

const dom = new Window({ url: 'http://localhost:49173' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Document', 'HTMLButtonElement']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
let openChat: (chatId: string) => void
let visibleChats: Array<string | null>
let creates: number
let loading: boolean
let ids: string[]
const elements = new Map<string, React.ComponentType>()
mock.module('framer-motion', () => ({
  useReducedMotion: () => true,
  useMotionValue: () => {},
  useTransform: () => {},
  animate: () => {},
  motion: new Proxy({}, { get: (_target, tag: string) => {
    if (!elements.has(tag)) elements.set(tag, React.forwardRef((props: Record<string, unknown>, ref) => {
      const { initial, animate, transition, exit, layout, layoutId, whileHover, whileTap, ...rest } = props
      return React.createElement(tag, { ...rest, ref })
    }))
    return elements.get(tag)
  } }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children
}))
mock.module('../../src/renderer/src/components/Sidebar', () => ({
  Sidebar: ({ onSelect }: { onSelect: (view: string) => void }) => <button onClick={() => onSelect('home')}>Home</button>
}))
mock.module('../../src/renderer/src/components/TopBar', () => ({
  TopBar: ({ onToggleChat }: { onToggleChat: () => void }) => <button onClick={onToggleChat}>Toggle chat</button>
}))
mock.module('../../src/renderer/src/components/ConnectGate', () => ({ ConnectGate: () => null }))
mock.module('../../src/renderer/src/views/AssistantView', () => ({
  AssistantView: ({ chat }: { chat: { activeChatId: string } }) => <div data-assistant-chat={chat.activeChatId} />
}))
mock.module('../../src/renderer/src/components/AssistantPanel', () => ({ AssistantPanel: () => <div data-assistant-panel /> }))
mock.module('../../src/renderer/src/hooks/useChat', () => ({
  useChat: () => {
    const [activeChatId, select] = useState('chat-a')
    return { activeChatId, loading, sessions: ids.map((id) => ({ id })), select,
      create: async () => { creates++ }, turns: [], streamingChatIds: [], busy: false }
  }
}))
const { default: App } = await import('../../src/renderer/src/App')
let root: ReturnType<typeof createRoot>
let container: HTMLDivElement
let client: InstanceType<typeof QueryClient>
const render = () => root.render(<QueryClientProvider client={client}><App /></QueryClientProvider>)
beforeEach(async () => {
  creates = 0; loading = false; ids = ['chat-a', 'chat-b']; visibleChats = []
  dom.history.replaceState(null, '')
  Object.assign(dom, { pulse: {
    app: { onNewChat: () => () => {}, onNavigate: () => () => {}, onOpenChat: (callback: typeof openChat) => {
      openChat = callback; return () => {}
    } },
    settings: { get: async () => ({ menuBarEnabled: false, responseNotificationsEnabled: true, responseNotificationSound: false, responseNotificationPreviews: false,
      googleClientId: '', googleClientSecret: '', goals: DEFAULT_GOALS, assistant: DEFAULT_ASSISTANT, chatRetention: 'forever' }) },
    google: { status: async () => ({ connected: false }), onStatusChanged: () => () => {} },
    codex: { status: async () => ({ connected: false }) },
    ai: { setVisibleChat: async (chatId: string | null) => { visibleChats.push(chatId) } }
  } })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  client = new QueryClient()
  await act(async () => render())
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove() })
afterAll(async () => { await dom.happyDOM.close() })

test('notification click opens its existing chat from another view without creating a new chat', async () => {
  expect(visibleChats.at(-1)).toBeNull()
  await act(async () => openChat('chat-b'))
  expect(document.querySelector('[data-assistant-chat]')?.getAttribute('data-assistant-chat')).toBe('chat-b')
  expect(dom.history.state.view).toBe('assistant')
  expect(visibleChats.at(-1)).toBe('chat-b')
  expect(creates).toBe(0)
  await act(async () => openChat('chat-a'))
  expect(document.querySelector('[data-assistant-chat]')?.getAttribute('data-assistant-chat')).toBe('chat-a')
})

test('deleted chats and chats missing after an account reload do not change the view', async () => {
  ids = ['chat-a']
  await act(async () => render())
  await act(async () => openChat('chat-b'))
  expect(dom.history.state.view).toBe('home')
  expect(creates).toBe(0)
})

test('opening and closing the side panel reports whether the selected chat is visible', async () => {
  const toggle = () => Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Toggle chat')!
  await act(async () => toggle().click())
  expect(visibleChats.at(-1)).toBe('chat-a')
  await act(async () => toggle().click())
  expect(visibleChats.at(-1)).toBeNull()
})

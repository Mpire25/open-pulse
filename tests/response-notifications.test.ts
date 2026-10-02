import { describe, expect, test } from 'bun:test'
import { ResponseNotificationController } from '../src/main/response-notification-controller'
import type { AiEvent } from '../src/shared/types'

const success = (chatId = 'chat-a', runId = 'run-a'): AiEvent => ({
  type: 'done', outcome: 'completed', chatId, runId, text: 'Private health details', parts: []
})

function harness() {
  let enabled = true
  let sound = false
  let previews = false
  let focused = false
  let now = 1_000
  let supported = true
  let fails = false
  const notifications: Array<{
    options: { title: string; body: string; silent: boolean; groupId: string }
    click: () => void
    finished: () => void
    shows: number
    closes: number
  }> = []
  const opened: Array<[number, string]> = []
  const controller = new ResponseNotificationController({
    preferences: () => ({ enabled, sound, previews }),
    isFocused: () => focused,
    now: () => now,
    openChat: (senderId, chatId) => { opened.push([senderId, chatId]) },
    create: (options, click, finished) => {
      if (!supported) return null
      const record = { options, click, finished, shows: 0, closes: 0 }
      notifications.push(record)
      return {
        show: () => { record.shows++; if (fails) throw new Error('OS refused notification') },
        close: () => { record.closes++ }
      }
    }
  })
  const complete = (senderId = 1, chatId = 'chat-a', runId = 'run-a') => {
    controller.observe(senderId, success(chatId, runId))
    controller.acknowledge(senderId, chatId, runId)
  }
  return {
    controller, notifications, opened, complete,
    setEnabled: (value: boolean) => { enabled = value },
    setPreviews: (value: boolean) => { previews = value },
    setSound: (value: boolean) => { sound = value },
    setFocused: (value: boolean) => { focused = value },
    setNow: (value: number) => { now = value },
    setSupported: (value: boolean) => { supported = value },
    setFails: (value: boolean) => { fails = value }
  }
}

describe('AI response notifications', () => {
  test('previews use the query and formatted final answer, with one notification per response grouped by chat', () => {
    const h = harness()
    h.setPreviews(true)
    h.controller.observe(1, success(), { query: 'How did I sleep?', text: 'You averaged **7h 12m** per night.' })
    h.controller.acknowledge(1, 'chat-a', 'run-a')
    h.controller.observe(1, success('chat-a', 'run-b'), { query: 'And last week?', text: 'You averaged **6h 47m**.' })
    h.controller.acknowledge(1, 'chat-a', 'run-b')
    h.controller.observe(1, success('chat-b', 'run-c'), { query: 'Show my steps', text: '' })
    h.controller.acknowledge(1, 'chat-b', 'run-c')
    expect(h.notifications).toHaveLength(3)
    expect(h.notifications[0].options).toEqual({ title: 'How did I sleep?', body: 'You averaged 7h 12m per night.', silent: true, groupId: 'openpulse-chat-chat-a' })
    expect(h.notifications[1].options).toMatchObject({ title: 'And last week?', body: 'You averaged 6h 47m.', groupId: 'openpulse-chat-chat-a' })
    expect(h.notifications[2].options).toMatchObject({ title: 'Show my steps', body: 'Your response is ready. Open the chat to view it.', groupId: 'openpulse-chat-chat-b' })
    expect(h.notifications.every((entry) => entry.shows === 1 && entry.closes === 0)).toBe(true)
    h.notifications[1].click()
    expect(h.opened).toEqual([[1, 'chat-a']])
  })

  test('both query and answer stay generic without opt-in, including preference changes before acknowledgement', () => {
    const h = harness()
    const answer = { query: 'Private query', text: 'Private answer' }
    h.controller.observe(1, success(), answer)
    h.setPreviews(true)
    h.controller.acknowledge(1, 'chat-a', 'run-a')
    expect(h.notifications[0].options).toMatchObject({ title: 'OpenPulse', body: 'Your AI response is ready.' })
    h.controller.observe(1, success('chat-a', 'run-b'), answer)
    h.setPreviews(false)
    h.controller.acknowledge(1, 'chat-a', 'run-b')
    expect(h.notifications[1].options).toMatchObject({ title: 'OpenPulse', body: 'Your AI response is ready.' })
  })

  test('disabling previews dismisses rich banners and removes pending excerpts without replaying them', () => {
    const h = harness()
    h.complete()
    h.setPreviews(true)
    const answer = { query: 'Private query', text: 'Private answer' }
    h.controller.observe(1, success('chat-a', 'run-b'), answer)
    h.controller.acknowledge(1, 'chat-a', 'run-b')
    h.controller.observe(1, success('chat-b', 'run-c'), answer)
    h.setPreviews(false)
    h.controller.clearPreviews()
    expect(h.notifications[0].closes).toBe(0)
    expect(h.notifications[1].closes).toBe(1)
    h.notifications[1].click()
    expect(h.opened).toHaveLength(0)
    h.setPreviews(true)
    h.controller.acknowledge(1, 'chat-b', 'run-c')
    expect(h.notifications[2].options).toMatchObject({ title: 'OpenPulse', body: 'Your AI response is ready.' })
  })

  test('requires a matching main-process success and renderer acknowledgement, deduplicated per run', () => {
    const h = harness()
    h.controller.acknowledge(1, 'chat-a', 'run-a')
    h.controller.observe(1, success())
    expect(h.notifications).toHaveLength(0)
    h.controller.acknowledge(2, 'chat-a', 'run-a')
    h.controller.acknowledge(1, 'wrong-chat', 'run-a')
    expect(h.notifications).toHaveLength(0)
    h.controller.acknowledge(1, 'chat-a', 'run-a')
    h.complete()
    expect(h.notifications).toHaveLength(1)
    expect(h.notifications[0].shows).toBe(1)
    expect(h.notifications[0].options).toEqual({ title: 'OpenPulse', body: 'Your AI response is ready.', silent: true, groupId: 'openpulse-chat-chat-a' })
  })

  test('only suppresses notifications when the same chat is visible in the focused window', () => {
    const h = harness()
    h.controller.setVisibleChat(1, 'chat-a')
    h.setFocused(true)
    h.complete()
    expect(h.notifications).toHaveLength(0)
    h.complete(1, 'chat-b', 'run-b')
    h.controller.setVisibleChat(1, null)
    h.complete(1, 'chat-a', 'run-c')
    h.controller.setVisibleChat(1, 'chat-a')
    h.setFocused(false) // Background, hidden, or minimized window.
    h.complete(1, 'chat-a', 'run-d')
    expect(h.notifications).toHaveLength(3)
  })

  test('disabled notifications do not replay later, sound is opt-in, visibility survives preference changes', () => {
    const h = harness()
    h.setEnabled(false)
    h.complete()
    h.setEnabled(true)
    h.controller.acknowledge(1, 'chat-a', 'run-a')
    expect(h.notifications).toHaveLength(0)
    h.setSound(true)
    h.complete(1, 'chat-a', 'run-b')
    expect(h.notifications[0].options.silent).toBe(false)
    h.controller.setVisibleChat(1, 'chat-a')
    h.controller.clear()
    h.setFocused(true)
    h.complete(1, 'chat-a', 'run-c')
    expect(h.notifications).toHaveLength(1)
  })

  test('errors, interruptions, tool progress and tool-limit answers never produce success notifications', () => {
    const h = harness()
    const events: AiEvent[] = [
      { ...success(), type: 'done', outcome: 'tool-limit', text: '', parts: [] },
      { type: 'error', chatId: 'chat-a', runId: 'run-a', message: 'Failed' },
      { type: 'interrupted', chatId: 'chat-a', runId: 'run-a', message: 'Stopped' },
      { type: 'tool', chatId: 'chat-a', runId: 'run-a', name: 'research_web', label: 'Researching' }
    ]
    for (const event of events) {
      h.controller.observe(1, event)
      h.controller.acknowledge(1, 'chat-a', 'run-a')
    }
    expect(h.notifications).toHaveLength(0)
  })

  test('concurrent chats and windows retain their own click destinations', () => {
    const h = harness()
    h.complete(1, 'chat-a', 'run-a')
    h.complete(1, 'chat-b', 'run-b')
    h.complete(2, 'chat-c', 'run-a')
    h.notifications[1].click()
    h.notifications[2].click()
    h.notifications[0].click()
    h.notifications[0].click()
    expect(h.opened).toEqual([[1, 'chat-b'], [2, 'chat-c'], [1, 'chat-a']])
  })

  test('deletion and window destruction dismiss only affected notifications and pending completions', () => {
    const h = harness()
    h.complete()
    h.complete(2, 'chat-b', 'run-b')
    h.controller.observe(1, success('chat-a', 'pending'))
    h.controller.clearChat('chat-a')
    h.controller.acknowledge(1, 'chat-a', 'pending')
    h.notifications[0].click()
    expect(h.notifications[0].closes).toBe(1)
    expect(h.notifications[1].closes).toBe(0)
    h.controller.clearSender(2)
    h.notifications[1].click()
    expect(h.notifications[1].closes).toBe(1)
    expect(h.opened).toHaveLength(0)
    expect(h.notifications).toHaveLength(2)
  })

  test('account changes and quitting discard pending acknowledgements and disable old clicks', () => {
    const h = harness()
    h.complete()
    h.controller.observe(1, success('chat-b', 'run-b'))
    h.controller.clear()
    h.controller.acknowledge(1, 'chat-b', 'run-b')
    h.notifications[0].click()
    expect(h.opened).toHaveLength(0)
    expect(h.notifications).toHaveLength(1)
    expect(h.notifications[0].closes).toBe(1)
  })

  test('retention cleanup removes expired chats while preserving notifications for kept chats', () => {
    const h = harness()
    h.complete()
    h.complete(1, 'kept-chat', 'run-b')
    h.controller.retainChats(new Set(['kept-chat']))
    h.notifications[0].click()
    h.notifications[1].click()
    expect(h.opened).toEqual([[1, 'kept-chat']])
  })

  test('expired acknowledgements, unsupported systems and OS failures are harmless', () => {
    const h = harness()
    h.controller.observe(1, success())
    h.setNow(61_000)
    h.controller.acknowledge(1, 'chat-a', 'run-a')
    expect(h.notifications).toHaveLength(0)
    h.setSupported(false)
    expect(() => h.complete(1, 'chat-a', 'run-b')).not.toThrow()
    h.setSupported(true)
    h.setFails(true)
    expect(() => h.complete(1, 'chat-a', 'run-c')).not.toThrow()
    expect(h.notifications[0].closes).toBe(1)
    h.notifications[0].click()
    expect(h.opened).toHaveLength(0)
  })
})

import { describe, expect, test } from 'bun:test'
import { mergeHistorySnapshot, type ChatTurn, type ViewChat } from '../src/renderer/src/hooks/useChat'
import type { ChatSession } from '../src/shared/types'

const at = '2026-08-11T10:00:00.000Z'

function turn(text: string, extra: Partial<ChatTurn> = {}): ChatTurn {
  return { id: crypto.randomUUID(), role: 'assistant', text, createdAt: at, ...extra }
}

function viewChat(id: string, extra: Partial<ViewChat> = {}): ViewChat {
  return { id, title: id, createdAt: at, updatedAt: at, turns: [], persisted: true, ...extra }
}

function storedSession(id: string, extra: Partial<ChatSession> = {}): ChatSession {
  return { id, title: id, createdAt: at, updatedAt: at, messages: [], ...extra }
}

const running = (ids: string[]) => (id: string): boolean => ids.includes(id)

describe('history snapshot merge', () => {
  test('keeps a streaming chat that cleanup removed before its first save landed', () => {
    const streaming = viewChat('mid-answer', { turns: [turn('Half an ans', { streaming: true })] })

    const merged = mergeHistorySnapshot([streaming], [storedSession('other')], running(['mid-answer']), true)

    expect(merged.map((chat) => chat.id)).toEqual(['mid-answer', 'other'])
    expect(merged[0].turns[0].text).toBe('Half an ans')
  })

  test('drops a persisted chat that retention expired when nothing is streaming', () => {
    const expired = viewChat('expired', { turns: [turn('Old answer')] })

    const merged = mergeHistorySnapshot([expired], [storedSession('fresh')], running([]), true)

    expect(merged.map((chat) => chat.id)).toEqual(['fresh'])
  })

  test('preserves live turns for a streaming chat still present in the snapshot', () => {
    const streaming = viewChat('live', { turns: [turn('Streaming text', { streaming: true })] })

    const merged = mergeHistorySnapshot([streaming], [storedSession('live')], running(['live']), true)

    expect(merged).toHaveLength(1)
    expect(merged[0].turns[0].text).toBe('Streaming text')
    expect(merged[0].persisted).toBe(true)
  })

  test('carries unsaved drafts through and adopts stored turns for idle chats', () => {
    const draft = viewChat('draft', { persisted: false, turns: [turn('Typed but unsent')] })
    const idle = viewChat('idle', { turns: [turn('Stale copy')] })
    const stored = storedSession('idle', {
      messages: [{ id: 'm1', role: 'assistant', text: 'Stored copy', createdAt: at }]
    })

    const merged = mergeHistorySnapshot([draft, idle], [stored], running([]), true)

    expect(merged.map((chat) => chat.id)).toEqual(['draft', 'idle'])
    expect(merged[1].turns[0].text).toBe('Stored copy')
  })

  test('a full reload keeps drafts but never revives a removed chat', () => {
    const draft = viewChat('draft', { persisted: false })
    const gone = viewChat('gone')

    const merged = mergeHistorySnapshot([draft, gone], [], running(['gone']), false)

    expect(merged.map((chat) => chat.id)).toEqual(['draft'])
  })
})

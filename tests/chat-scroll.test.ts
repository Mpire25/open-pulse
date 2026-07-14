import { describe, expect, test } from 'bun:test'
import {
  chatResponseSpacerHeight,
  latestChatExchange
} from '../src/renderer/src/lib/chat-scroll'

describe('assistant conversation scrolling', () => {
  test('finds the latest user and assistant exchange', () => {
    const exchange = latestChatExchange([
      { id: 'user-1', role: 'user' as const },
      { id: 'assistant-1', role: 'assistant' as const },
      { id: 'user-2', role: 'user' as const },
      { id: 'assistant-2', role: 'assistant' as const }
    ])

    expect(exchange).toEqual({
      user: { id: 'user-2', role: 'user' },
      assistant: { id: 'assistant-2', role: 'assistant' }
    })
  })

  test('reserves the unused viewport for a short upcoming response', () => {
    expect(chatResponseSpacerHeight(700, 100)).toBe(560)
    expect(chatResponseSpacerHeight(700, 660)).toBe(0)
    expect(chatResponseSpacerHeight(700, 900)).toBe(0)
  })
})

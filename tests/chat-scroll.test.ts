import { describe, expect, test } from 'bun:test'
import {
  chatFollowAfterUserScroll,
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

  const atBottom = {
    previousTop: 1000,
    top: 1000,
    maxTop: 1000,
    visibleBottom: 1700,
    responseBottom: 1680
  }

  test('stops following on any upward user scroll', () => {
    expect(chatFollowAfterUserScroll({ ...atBottom, top: 995, visibleBottom: 1695 })).toBe(false)
  })

  test('ignores scroll drops caused by content shrinking at the bottom', () => {
    expect(chatFollowAfterUserScroll({ ...atBottom, top: 990, maxTop: 990, visibleBottom: 1690 })).toBe(true)
  })

  test('resumes following only near the end of the response', () => {
    const scrolledAway = { ...atBottom, previousTop: 500 }
    expect(chatFollowAfterUserScroll({ ...scrolledAway, top: 600, visibleBottom: 1300 })).toBe(false)
    expect(chatFollowAfterUserScroll({ ...scrolledAway, top: 950, visibleBottom: 1650 })).toBe(true)
  })
})

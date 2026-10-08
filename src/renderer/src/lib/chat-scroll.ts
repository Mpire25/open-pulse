export const CHAT_TURN_TOP_INSET = 12
const CHAT_TURN_TRAILING_SPACE = 40
const CHAT_FOLLOW_RESUME_DISTANCE = 80

export interface ScrollableChatTurn {
  id: string
  role: 'user' | 'assistant'
}

export function latestChatExchange<T extends ScrollableChatTurn>(
  turns: T[]
): { user: T; assistant: T } | null {
  for (let index = turns.length - 1; index > 0; index--) {
    const assistant = turns[index]
    const user = turns[index - 1]
    if (assistant.role === 'assistant' && user.role === 'user') return { user, assistant }
  }
  return null
}

export function chatResponseSpacerHeight(viewportHeight: number, exchangeHeight: number): number {
  return Math.max(0, viewportHeight - exchangeHeight - CHAT_TURN_TRAILING_SPACE)
}

export interface ChatScrollSample {
  following: boolean
  previousTop: number
  top: number
  maxTop: number
  visibleBottom: number
  responseBottom: number
  programmatic: boolean
}

export function nextChatFollowState(sample: ChatScrollSample): boolean {
  // Programmatic scrolls only move down, so any upward move is the user. A drop
  // while pinned at maxTop is the browser clamping after content shrank.
  const scrolledUp = sample.top < sample.previousTop && sample.top < sample.maxTop - 1
  if (scrolledUp) return false
  if (sample.programmatic) return sample.following
  return sample.visibleBottom >= sample.responseBottom - CHAT_FOLLOW_RESUME_DISTANCE
}

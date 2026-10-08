export const CHAT_TURN_TOP_INSET = 12
export const USER_SCROLL_GRACE_MS = 250
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

export interface ChatUserScroll {
  previousTop: number
  top: number
  maxTop: number
  visibleBottom: number
  responseBottom: number
}

export function chatFollowAfterUserScroll(scroll: ChatUserScroll): boolean {
  // A drop while pinned at maxTop is the browser clamping after content shrank.
  const scrolledUp = scroll.top < scroll.previousTop && scroll.top < scroll.maxTop - 1
  if (scrolledUp) return false
  return scroll.visibleBottom >= scroll.responseBottom - CHAT_FOLLOW_RESUME_DISTANCE
}

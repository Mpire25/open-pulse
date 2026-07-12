export const CHAT_TURN_TOP_INSET = 12
const CHAT_TURN_TRAILING_SPACE = 40

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

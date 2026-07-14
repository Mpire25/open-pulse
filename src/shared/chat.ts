const DEFAULT_CHAT_TITLE = 'New chat'

export function generateChatTitle(text: string): string {
  const cleaned = text
    .replace(/[`*_>#|\[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return DEFAULT_CHAT_TITLE
  const sentence = cleaned.split(/(?<=[.!?])\s/, 1)[0].replace(/[.!?]+$/, '')
  if (sentence.length <= 48) return sentence
  const clipped = sentence.slice(0, 48).replace(/\s+\S*$/, '').trim()
  return `${clipped || sentence.slice(0, 48).trim()}…`
}

export interface InterruptedTurnState {
  text: string
  transient: boolean
}

export function interruptedTurnState(text: string, message: string): InterruptedTurnState {
  const partial = text.trimEnd()
  return partial
    ? { text: `${partial}\n\n_${message}_`, transient: false }
    : { text: message, transient: true }
}

export { DEFAULT_CHAT_TITLE }

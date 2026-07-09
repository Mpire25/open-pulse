import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiEvent, ChatMessage } from '@shared/types'

export interface ChatTurn extends ChatMessage {
  id: string
  streaming?: boolean
  toolLabel?: string
  error?: boolean
}

let counter = 0
const nextId = (): string => `${Date.now()}-${counter++}`

export function useChat(): {
  turns: ChatTurn[]
  busy: boolean
  send: (text: string) => void
  reset: () => void
} {
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const chatIdRef = useRef<string>(nextId())
  const activeAssistantId = useRef<string | null>(null)

  useEffect(() => {
    const off = window.pulse.ai.onEvent((event: AiEvent) => {
      if (event.chatId !== chatIdRef.current) return
      const assistantId = activeAssistantId.current
      if (!assistantId) return

      setTurns((prev) =>
        prev.map((turn) => {
          if (turn.id !== assistantId) return turn
          switch (event.type) {
            case 'delta':
              return { ...turn, text: turn.text + event.text, toolLabel: undefined }
            case 'tool':
              return { ...turn, toolLabel: event.label }
            case 'reasoning':
              return turn.text ? turn : { ...turn, toolLabel: turn.toolLabel ?? 'Thinking' }
            case 'done':
              return { ...turn, text: event.text || turn.text, streaming: false, toolLabel: undefined }
            case 'error':
              return { ...turn, text: event.message, streaming: false, error: true, toolLabel: undefined }
            default:
              return turn
          }
        })
      )
      if (event.type === 'done' || event.type === 'error') {
        setBusy(false)
        activeAssistantId.current = null
      }
    })
    return off
  }, [])

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busy) return

      const userTurn: ChatTurn = { id: nextId(), role: 'user', text: trimmed }
      const assistantTurn: ChatTurn = { id: nextId(), role: 'assistant', text: '', streaming: true }
      activeAssistantId.current = assistantTurn.id
      setBusy(true)

      setTurns((prev) => {
        const next = [...prev, userTurn, assistantTurn]
        // History sent to the model excludes the empty streaming placeholder.
        const history: ChatMessage[] = next
          .filter((t) => t.id !== assistantTurn.id && !t.error)
          .map(({ role, text }) => ({ role, text }))
        void window.pulse.ai.send(chatIdRef.current, history)
        return next
      })
    },
    [busy]
  )

  const reset = useCallback(() => {
    chatIdRef.current = nextId()
    activeAssistantId.current = null
    setTurns([])
    setBusy(false)
  }, [])

  return { turns, busy, send, reset }
}

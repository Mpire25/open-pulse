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
  const turnsRef = useRef<ChatTurn[]>([])
  const busyRef = useRef(false)
  const chatIdRef = useRef<string>(nextId())
  const activeAssistantId = useRef<string | null>(null)

  useEffect(() => {
    const off = window.pulse.ai.onEvent((event: AiEvent) => {
      if (event.chatId !== chatIdRef.current) return
      const assistantId = activeAssistantId.current
      if (!assistantId) return

      const nextTurns = turnsRef.current.map((turn) => {
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
      turnsRef.current = nextTurns
      setTurns(nextTurns)

      if (event.type === 'done' || event.type === 'error') {
        busyRef.current = false
        setBusy(false)
        activeAssistantId.current = null
      }
    })
    return off
  }, [])

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || busyRef.current) return

      const userTurn: ChatTurn = { id: nextId(), role: 'user', text: trimmed }
      const assistantTurn: ChatTurn = { id: nextId(), role: 'assistant', text: '', streaming: true }
      const chatId = chatIdRef.current
      const nextTurns = [...turnsRef.current, userTurn, assistantTurn]

      activeAssistantId.current = assistantTurn.id
      busyRef.current = true
      turnsRef.current = nextTurns
      setBusy(true)
      setTurns(nextTurns)

      // Capture the session id before dispatch. A reset can rotate the live id,
      // but it must never move this conversation's history into the new session.
      const history: ChatMessage[] = nextTurns
        .filter((turn) => turn.id !== assistantTurn.id && !turn.error)
        .map(({ role, text }) => ({ role, text }))
      void window.pulse.ai.send(chatId, history)
    },
    []
  )

  const reset = useCallback(() => {
    // Rotate the id and refs synchronously so late events from the old request
    // are rejected even before React commits the empty UI state.
    chatIdRef.current = nextId()
    activeAssistantId.current = null
    busyRef.current = false
    turnsRef.current = []
    setTurns([])
    setBusy(false)
  }, [])

  return { turns, busy, send, reset }
}

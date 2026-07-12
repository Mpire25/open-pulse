import { useCallback, useEffect, useRef, useState } from 'react'
import { generateChatTitle } from '@shared/chat'
import { assistantPartsContext } from '@shared/assistant-parts'
import type {
  AiEvent,
  AssistantVisualPart,
  ChatHistorySnapshot,
  ChatMessage,
  ChatSession,
  ChatSessionMessage
} from '@shared/types'

export interface ChatTurn extends ChatSessionMessage {
  streaming?: boolean
  toolLabel?: string
  error?: boolean
}

interface ViewChat extends Omit<ChatSession, 'messages'> {
  turns: ChatTurn[]
  persisted: boolean
}

interface ActiveRun {
  runId: string
  assistantId: string
}

export interface ChatController {
  sessions: ChatSession[]
  activeChatId: string | null
  turns: ChatTurn[]
  busy: boolean
  loading: boolean
  streamingChatIds: string[]
  send: (text: string) => void
  create: () => Promise<void>
  select: (id: string) => void
  pin: (id: string, pinned: boolean) => Promise<void>
  delete: (id: string) => Promise<void>
  reload: () => Promise<void>
}

const newId = (): string => crypto.randomUUID()

function toViewChat(session: ChatSession): ViewChat {
  return { ...session, turns: session.messages.map((message) => ({ ...message })), persisted: true }
}

function createDraftChat(): ViewChat {
  const now = new Date().toISOString()
  return {
    id: newId(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    turns: [],
    persisted: false
  }
}

function persistedMessages(turns: ChatTurn[]): ChatSessionMessage[] {
  return turns
    .filter((turn) => !turn.error && !turn.streaming && (turn.text.trim() || turn.parts?.length))
    .map(({ id, role, text, createdAt, parts }) => ({
      id,
      role,
      text,
      createdAt,
      ...(role === 'assistant' && parts?.length ? { partsVersion: 1 as const, parts } : {})
    }))
}

function withDisplayContext(role: ChatMessage['role'], text: string, parts?: AssistantVisualPart[]): string {
  return role === 'assistant' ? text + assistantPartsContext(parts ?? []) : text
}

function asSession(chat: ViewChat): ChatSession {
  const { turns, persisted: _persisted, ...session } = chat
  return { ...session, messages: persistedMessages(turns) }
}

function sortChats(chats: ViewChat[]): ViewChat[] {
  return [...chats].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function useChat(): ChatController {
  const [chats, setChats] = useState<ViewChat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const chatsRef = useRef<ViewChat[]>([])
  const activeChatIdRef = useRef<string | null>(null)
  const runsRef = useRef(new Map<string, ActiveRun>())
  const accountEpochRef = useRef(0)

  const publish = useCallback((next: ViewChat[]): void => {
    const sorted = sortChats(next)
    chatsRef.current = sorted
    setChats(sorted)
  }, [])

  const chooseActive = useCallback((id: string | null): void => {
    activeChatIdRef.current = id
    setActiveChatId(id)
  }, [])

  const mergeSession = useCallback(
    (session: ChatSession): void => {
      const current = chatsRef.current.find((chat) => chat.id === session.id)
      publish([
        ...chatsRef.current.filter((chat) => chat.id !== session.id),
        current ? { ...session, turns: current.turns, persisted: true } : toViewChat(session)
      ])
    },
    [publish]
  )

  const applySnapshot = useCallback(
    (snapshot: ChatHistorySnapshot, preserveRunning: boolean): void => {
      const currentById = new Map(chatsRef.current.map((chat) => [chat.id, chat]))
      const stored = snapshot.sessions.map((session) => {
        const current = currentById.get(session.id)
        return preserveRunning && current && runsRef.current.has(session.id)
          ? { ...session, turns: current.turns, persisted: true }
          : toViewChat(session)
      })
      const drafts = chatsRef.current.filter(
        (chat) => !chat.persisted && !stored.some((session) => session.id === chat.id)
      )
      const next = [...drafts, ...stored]
      publish(next)
      const selected = next.find((chat) => chat.id === activeChatIdRef.current)
      if (!selected) chooseActive(next[0]?.id ?? null)
    },
    [chooseActive, publish]
  )

  const create = useCallback(async (): Promise<void> => {
    const reusable = chatsRef.current.find(
      (chat) => !chat.persisted && chat.turns.length === 0 && !runsRef.current.has(chat.id)
    )
    if (reusable) {
      chooseActive(reusable.id)
      return
    }
    const draft = createDraftChat()
    publish([draft, ...chatsRef.current])
    chooseActive(draft.id)
  }, [chooseActive, publish])

  const reload = useCallback(async (): Promise<void> => {
    const epoch = accountEpochRef.current + 1
    accountEpochRef.current = epoch
    runsRef.current.clear()
    chooseActive(null)
    publish([])
    setLoading(true)
    try {
      const snapshot = await window.pulse.chats.list()
      if (epoch !== accountEpochRef.current) return
      let sessions = snapshot.sessions
      if (!sessions.length) {
        const draft = createDraftChat()
        publish([draft])
        chooseActive(draft.id)
        return
      }
      const next = sessions.map(toViewChat)
      publish(next)
      chooseActive(next[0]?.id ?? null)
    } finally {
      if (epoch === accountEpochRef.current) setLoading(false)
    }
  }, [chooseActive, publish])

  const updateTurns = useCallback(
    (chatId: string, update: (turns: ChatTurn[]) => ChatTurn[]): void => {
      publish(
        chatsRef.current.map((chat) => (chat.id === chatId ? { ...chat, turns: update(chat.turns) } : chat))
      )
    },
    [publish]
  )

  const saveCompletedChat = useCallback(
    async (chatId: string): Promise<void> => {
      const chat = chatsRef.current.find((candidate) => candidate.id === chatId)
      if (!chat) return
      const epoch = accountEpochRef.current
      try {
        const session = await window.pulse.chats.update(chatId, persistedMessages(chat.turns))
        if (epoch === accountEpochRef.current) mergeSession(session)
      } catch {
        // The completed answer remains visible in memory if secure persistence fails.
      }
    },
    [mergeSession]
  )

  useEffect(() => {
    void reload()
    const offAccount = window.pulse.chats.onAccountChanged(() => void reload())
    return offAccount
  }, [reload])

  useEffect(() => {
    return window.pulse.ai.onEvent((event: AiEvent) => {
      const run = runsRef.current.get(event.chatId)
      if (!run || run.runId !== event.runId) return

      updateTurns(event.chatId, (turns) =>
        turns.map((turn) => {
          if (turn.id !== run.assistantId) return turn
          switch (event.type) {
            case 'delta':
              return { ...turn, text: turn.text + event.text, toolLabel: undefined }
            case 'tool':
              return { ...turn, toolLabel: event.label }
            case 'reasoning':
              return turn.text ? turn : { ...turn, toolLabel: turn.toolLabel ?? 'Thinking' }
            case 'done':
              return {
                ...turn,
                text: event.text || turn.text,
                parts: event.parts,
                streaming: false,
                toolLabel: undefined
              }
            case 'error':
              return { ...turn, text: event.message, streaming: false, error: true, toolLabel: undefined }
          }
        })
      )

      if (event.type === 'done' || event.type === 'error') {
        runsRef.current.delete(event.chatId)
        if (event.type === 'done') void saveCompletedChat(event.chatId)
      }
    })
  }, [saveCompletedChat, updateTurns])

  const send = useCallback(
    (text: string): void => {
      const trimmed = text.trim()
      const chatId = activeChatIdRef.current
      const chat = chatsRef.current.find((candidate) => candidate.id === chatId)
      if (!trimmed || !chat || runsRef.current.has(chat.id)) return

      const createdAt = new Date().toISOString()
      const userTurn: ChatTurn = { id: newId(), role: 'user', text: trimmed, createdAt }
      const assistantTurn: ChatTurn = {
        id: newId(),
        role: 'assistant',
        text: '',
        createdAt,
        streaming: true
      }
      const runId = newId()
      const nextTurns = [...chat.turns, userTurn, assistantTurn]
      const title = chat.title === 'New chat' ? generateChatTitle(trimmed) : chat.title
      const updatedAt = new Date().toISOString()
      runsRef.current.set(chat.id, { runId, assistantId: assistantTurn.id })
      publish(
        chatsRef.current.map((candidate) =>
          candidate.id === chat.id ? { ...candidate, title, updatedAt, turns: nextTurns } : candidate
        )
      )

      const history: ChatMessage[] = nextTurns
        .filter((turn) => turn.id !== assistantTurn.id && !turn.error)
        .map(({ role, text: messageText, parts }) => ({
          role,
          text: withDisplayContext(role, messageText, parts)
        }))
      const epoch = accountEpochRef.current
      const createIfNeeded = chat.persisted
        ? Promise.resolve<ChatSession | null>(null)
        : window.pulse.chats.create(chat.id)
      void createIfNeeded
        .then((session) => {
          if (session && epoch === accountEpochRef.current) mergeSession(session)
          return window.pulse.chats.update(chat.id, persistedMessages(nextTurns))
        })
        .then((session) => {
          if (epoch === accountEpochRef.current) mergeSession(session)
        })
        .catch(() => undefined)
        .finally(() => {
          if (epoch === accountEpochRef.current && runsRef.current.get(chat.id)?.runId === runId) {
            void window.pulse.ai.send(chat.id, runId, history)
          }
        })
    },
    [mergeSession, publish]
  )

  const select = useCallback(
    (id: string): void => {
      if (chatsRef.current.some((chat) => chat.id === id)) chooseActive(id)
    },
    [chooseActive]
  )

  const pin = useCallback(
    async (id: string, pinned: boolean): Promise<void> => {
      const epoch = accountEpochRef.current
      // Optimistic: the list regroups immediately; the store confirms after.
      publish(chatsRef.current.map((chat) => (chat.id === id ? { ...chat, pinned } : chat)))
      try {
        const session = await window.pulse.chats.setPinned(id, pinned)
        if (epoch === accountEpochRef.current) mergeSession(session)
      } catch {
        if (epoch === accountEpochRef.current) {
          publish(chatsRef.current.map((chat) => (chat.id === id ? { ...chat, pinned: !pinned } : chat)))
        }
      }
    },
    [mergeSession, publish]
  )

  const cancelRun = useCallback((id: string): void => {
    const run = runsRef.current.get(id)
    if (!run) return
    runsRef.current.delete(id)
    void window.pulse.ai.cancel(id, run.runId)
  }, [])

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      const deletingActiveChat = id === activeChatIdRef.current
      cancelRun(id)
      const snapshot = await window.pulse.chats.delete(id)
      applySnapshot(snapshot, true)
      if (deletingActiveChat) await create()
    },
    [applySnapshot, cancelRun, create]
  )

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null
  const streamingChatIds = chats.filter((chat) => runsRef.current.has(chat.id)).map((chat) => chat.id)

  return {
    sessions: chats.filter((chat) => chat.persisted).map(asSession),
    activeChatId,
    turns: activeChat?.turns ?? [],
    busy: activeChat ? runsRef.current.has(activeChat.id) : false,
    loading,
    streamingChatIds,
    send,
    create,
    select,
    pin,
    delete: deleteChat,
    reload
  }
}

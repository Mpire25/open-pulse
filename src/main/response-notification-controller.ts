import type { AiEvent } from '../shared/types'

interface Completion {
  senderId: number
  chatId: string
  runId: string
  expiresAt: number
}

interface NotificationHandle {
  show: () => void
  close: () => void
}

interface Dependencies {
  preferences: () => { enabled: boolean; sound: boolean }
  isFocused: (senderId: number) => boolean
  openChat: (senderId: number, chatId: string) => void
  create: (
    options: { title: string; body: string; silent: boolean },
    click: () => void,
    finished: () => void
  ) => NotificationHandle | null
  now?: () => number
}

/** Matches a main-process success to the renderer that actually accepted it. */
export class ResponseNotificationController {
  private readonly visibleChats = new Map<number, string | null>()
  private readonly pending = new Map<string, Completion>()
  private readonly seen = new Map<string, Completion>()
  private readonly displayed = new Map<string, { completion: Completion; notification: NotificationHandle }>()

  constructor(private readonly dependencies: Dependencies) {}

  private key(senderId: number, runId: string): string {
    return `${senderId}:${runId}`
  }

  setVisibleChat(senderId: number, chatId: string | null): void {
    this.visibleChats.set(senderId, chatId)
  }

  observe(senderId: number, event: AiEvent): void {
    if (event.type !== 'done' || event.outcome !== 'completed') return
    const key = this.key(senderId, event.runId)
    if (this.seen.has(key)) return
    const now = (this.dependencies.now ?? Date.now)()
    for (const [id, completion] of this.pending) {
      if (completion.expiresAt <= now) this.pending.delete(id)
    }
    const completion = { senderId, chatId: event.chatId, runId: event.runId, expiresAt: now + 60_000 }
    this.seen.set(key, completion)
    this.pending.set(key, completion)
    // Bound metadata without retaining any answer text or health data.
    if (this.seen.size > 256) {
      const oldest = this.seen.keys().next().value!
      this.seen.delete(oldest)
      this.pending.delete(oldest)
    }
  }

  acknowledge(senderId: number, chatId: string, runId: string): void {
    const key = this.key(senderId, runId)
    const completion = this.pending.get(key)
    if (!completion || completion.chatId !== chatId) return
    this.pending.delete(key)
    if (completion.expiresAt <= (this.dependencies.now ?? Date.now)()) return
    const { enabled, sound } = this.dependencies.preferences()
    if (!enabled || (this.visibleChats.get(senderId) === chatId && this.dependencies.isFocused(senderId))) return

    const finished = (): void => { this.displayed.delete(key) }
    const click = (): void => {
      if (!this.displayed.has(key)) return
      this.dismiss(key)
      this.dependencies.openChat(senderId, chatId)
    }
    try {
      const notification = this.dependencies.create(
        { title: 'OpenPulse', body: 'Your AI response is ready.', silent: !sound }, click, finished
      )
      if (!notification) return
      this.displayed.set(key, { completion, notification })
      if (this.displayed.size > 50) this.dismiss(this.displayed.keys().next().value!)
      notification.show()
    } catch {
      this.dismiss(key)
      // Notification delivery must never turn a completed response into an error.
    }
  }

  private dismiss(key: string): void {
    const entry = this.displayed.get(key)
    this.displayed.delete(key)
    try { entry?.notification.close() } catch { /* Best-effort OS cleanup. */ }
  }

  private clearMatching(matches: (completion: Completion) => boolean): void {
    for (const [key, completion] of this.pending) if (matches(completion)) this.pending.delete(key)
    // Keep seen IDs until window/account cleanup so a late duplicate cannot notify.
    for (const [key, entry] of this.displayed) if (matches(entry.completion)) this.dismiss(key)
  }

  clearChat(chatId: string): void {
    this.clearMatching((completion) => completion.chatId === chatId)
  }

  retainChats(chatIds: ReadonlySet<string>): void {
    this.clearMatching((completion) => !chatIds.has(completion.chatId))
  }

  clearSender(senderId: number): void {
    this.clearMatching((completion) => completion.senderId === senderId)
    for (const [key, completion] of this.seen) if (completion.senderId === senderId) this.seen.delete(key)
    this.visibleChats.delete(senderId)
  }

  clear(): void {
    this.clearMatching(() => true)
    this.seen.clear()
  }
}

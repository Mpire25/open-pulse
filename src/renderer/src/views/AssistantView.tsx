import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ClockCounterClockwise, Plus, Sparkle } from '@phosphor-icons/react'
import { ChatPanel, type ChatState } from '@/components/ChatPanel'
import { ChatHistory } from '@/components/ChatHistory'
import { cn } from '@/lib/utils'
import type { CodexAuthStatus } from '@shared/types'

interface AssistantViewProps {
  chat: ChatState
  codex: CodexAuthStatus
  onOpenSettings: () => void
}

export function AssistantView({ chat, codex, onOpenSettings }: AssistantViewProps): React.JSX.Element {
  // History is a transient sheet that slides in from the right — never
  // permanent chrome. Hovering the clock button summons it; it stays while
  // the pointer is over the button or the sheet, and a grace delay covers
  // the travel between them.
  const [historyOpen, setHistoryOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = (): void => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const openHistory = (): void => {
    cancelClose()
    setHistoryOpen(true)
  }

  const scheduleClose = (): void => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setHistoryOpen(false), 300)
  }

  useEffect(() => cancelClose, [])

  useEffect(() => {
    if (!historyOpen) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setHistoryOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [historyOpen])

  return (
    // overflow-hidden clips the history sheet while it slides in from
    // off-screen right, so no horizontal scrollbar appears mid-animation.
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden">
      {/* The header sits on the app's standard 1060px page grid — wider than
          the 820px chat column so it doesn't float mid-page, without running
          all the way to the window edges. */}
      <div className="mx-auto flex w-full max-w-[1060px] items-center justify-between px-8 pb-2 pt-1.5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent-soft">
            <Sparkle size={14} weight="fill" className="text-accent" />
          </div>
          <span className="display text-[15px] font-bold">Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              void chat.create()
              setHistoryOpen(false)
            }}
            disabled={chat.loading}
            aria-label="New chat"
            title="New chat"
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-40"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onMouseEnter={openHistory}
            onMouseLeave={scheduleClose}
            onClick={() => (historyOpen ? setHistoryOpen(false) : openHistory())}
            aria-label="Conversation history"
            aria-expanded={historyOpen}
            aria-haspopup="true"
            title="History"
            className={cn(
              'grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink',
              historyOpen && 'bg-white/[0.07] text-ink'
            )}
          >
            <ClockCounterClockwise size={15} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ChatPanel chat={chat} codexConnected={codex.connected} onOpenSettings={onOpenSettings} />
      </div>

      {/* A floating card, not an edge-flush sheet: inset from the edges with
          the app's panel recipe (rounded, hairline, diffusion shadow) so it
          reads as a temporary layer above the page. It rises over the header
          buttons like a native menu, so its header carries its own new-chat
          affordance while open. */}
      <AnimatePresence>
        {historyOpen && (
          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            className="absolute bottom-3 right-3 top-1.5 z-30 flex w-[300px] flex-col overflow-hidden rounded-[22px] border border-hairline bg-panel shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8)]"
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-hairline pl-4 pr-2">
              <span className="display text-[13px] font-semibold text-ink">Chats</span>
              <button
                type="button"
                onClick={() => {
                  void chat.create()
                  setHistoryOpen(false)
                }}
                disabled={chat.loading}
                aria-label="New chat"
                title="New chat"
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-40"
              >
                <Plus size={15} />
              </button>
            </div>
            <ChatHistory chat={chat} onNavigate={() => setHistoryOpen(false)} />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

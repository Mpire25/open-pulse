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
  // History is a hover popover rather than a permanent rail — the chat itself
  // is the page; past conversations are a quick reach-in. A short close delay
  // forgives the pointer briefly leaving on the way to the panel.
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
    closeTimer.current = window.setTimeout(() => setHistoryOpen(false), 180)
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
    <div className="flex h-full w-full min-w-0 flex-col">
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
          <div className="relative" onMouseEnter={openHistory} onMouseLeave={scheduleClose}>
            <button
              type="button"
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
            <AnimatePresence>
              {historyOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  // pt-2 bridges the visual gap so the pointer never leaves
                  // the hover area while travelling from button to panel.
                  className="absolute right-0 top-full z-30 pt-2"
                >
                  <div className="flex max-h-[min(420px,60vh)] w-[300px] flex-col overflow-hidden rounded-2xl border border-hairline bg-panel shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8)]">
                    <ChatHistory chat={chat} onNavigate={() => setHistoryOpen(false)} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ChatPanel chat={chat} codexConnected={codex.connected} onOpenSettings={onOpenSettings} />
      </div>
    </div>
  )
}

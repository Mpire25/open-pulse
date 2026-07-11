import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ClockCounterClockwise, Plus, Sparkle, X } from '@phosphor-icons/react'
import { ChatPanel, type ChatState } from '@/components/ChatPanel'
import { ChatHistory } from '@/components/ChatHistory'
import { cn } from '@/lib/utils'

interface AssistantPanelProps {
  open: boolean
  onClose: () => void
  chat: ChatState
  codexConnected: boolean
  onOpenSettings: () => void
}

const PANEL_WIDTH = 384

/**
 * Side assistant that expands into the layout: the page content shrinks next
 * to it instead of being covered. The inner column keeps a fixed width and is
 * anchored right so the chat doesn't squish while the panel animates.
 */
export function AssistantPanel({
  open,
  onClose,
  chat,
  codexConnected,
  onOpenSettings
}: AssistantPanelProps): React.JSX.Element {
  const [historyOpen, setHistoryOpen] = useState(false)

  useEffect(() => {
    if (!open) setHistoryOpen(false)
  }, [open])

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? PANEL_WIDTH : 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 34 }}
      className="relative shrink-0 overflow-hidden"
      aria-hidden={!open}
    >
      <div
        className="absolute inset-y-0 right-0 flex flex-col border-l border-hairline bg-panel"
        style={{ width: PANEL_WIDTH }}
      >
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent-soft">
              <Sparkle size={13} weight="fill" className="text-accent" />
            </div>
            <span className="text-[13.5px] font-semibold">{historyOpen ? 'Chats' : 'Assistant'}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                void chat.create()
                setHistoryOpen(false)
              }}
              disabled={chat.loading}
              aria-label="New chat"
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink disabled:opacity-40"
            >
              <Plus size={15} />
            </button>
            <button
              onClick={() => setHistoryOpen((value) => !value)}
              aria-label="Conversation history"
              aria-pressed={historyOpen}
              className={cn(
                'grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink',
                historyOpen && 'bg-white/[0.07] text-ink'
              )}
            >
              <ClockCounterClockwise size={15} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close assistant"
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              <X size={15} weight="bold" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {historyOpen ? (
            <ChatHistory chat={chat} compact onNavigate={() => setHistoryOpen(false)} />
          ) : (
            <ChatPanel
              chat={chat}
              codexConnected={codexConnected}
              onOpenSettings={onOpenSettings}
              compact
              autoFocus={open}
            />
          )}
        </div>
      </div>
    </motion.aside>
  )
}

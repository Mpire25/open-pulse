import { motion } from 'framer-motion'
import { Broom, Sparkle, X } from '@phosphor-icons/react'
import { ChatPanel, type ChatState } from '@/components/ChatPanel'

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
            <span className="text-[13.5px] font-semibold">Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            {chat.turns.length > 0 && (
              <button
                onClick={chat.reset}
                aria-label="New chat"
                className="grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
              >
                <Broom size={15} />
              </button>
            )}
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
          <ChatPanel chat={chat} codexConnected={codexConnected} onOpenSettings={onOpenSettings} compact />
        </div>
      </div>
    </motion.aside>
  )
}

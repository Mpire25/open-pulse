import { AnimatePresence, motion } from 'framer-motion'
import { Broom, Sparkle, X } from '@phosphor-icons/react'
import { ChatPanel, type ChatState } from '@/components/ChatPanel'

interface ChatSheetProps {
  open: boolean
  onClose: () => void
  chat: ChatState
  codexConnected: boolean
  onOpenSettings: () => void
}

/** Slide-over assistant, available from any view. Same conversation as the page. */
export function ChatSheet({ open, onClose, chat, codexConnected, onOpenSettings }: ChatSheetProps): React.JSX.Element {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 400, opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0.6 }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="absolute inset-y-0 right-0 z-40 flex w-[372px] flex-col border-l border-hairline bg-panel/95 shadow-[-30px_0_80px_-40px_rgb(0_0_0/0.9)] backdrop-blur-2xl"
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
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

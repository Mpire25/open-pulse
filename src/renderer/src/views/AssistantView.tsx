import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ClockCounterClockwise, Plus, Sparkle } from '@phosphor-icons/react'
import { ChatPanel, type ChatDraftSetter, type ChatState } from '@/components/ChatPanel'
import { ChatHistory } from '@/components/ChatHistory'
import { cn } from '@/lib/utils'
import type { AssistantAction, CodexAuthStatus } from '@shared/types'

interface AssistantViewProps {
  chat: ChatState
  composerDraft: string
  setComposerDraft: ChatDraftSetter
  codex: CodexAuthStatus
  composerFocusRequest: number
  onOpenSettings: () => void
  onAssistantAction: (action: AssistantAction) => void
}

export function AssistantView({
  chat,
  composerDraft,
  setComposerDraft,
  codex,
  composerFocusRequest,
  onOpenSettings,
  onAssistantAction
}: AssistantViewProps): React.JSX.Element {
  // History is a transient sheet that slides in from the right — never
  // permanent chrome. Hovering the clock button summons it; it stays while
  // the pointer is over the button or the sheet, and a grace delay covers
  // the travel between them.
  const [historyOpen, setHistoryOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const historyRef = useRef<HTMLElement>(null)
  const historyTriggerRef = useRef<HTMLButtonElement>(null)
  const pointerPosition = useRef<{ x: number; y: number } | null>(null)
  const deleteDialogOpen = useRef(false)

  const pointerOverHistory = (): boolean => {
    const position = pointerPosition.current
    if (!position) return false
    return [historyRef.current, historyTriggerRef.current].some((element) => {
      if (!element) return false
      const rect = element.getBoundingClientRect()
      return position.x >= rect.left && position.x < rect.right && position.y >= rect.top && position.y < rect.bottom
    })
  }

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
    if (deleteDialogOpen.current || historyRef.current?.contains(document.activeElement)) return
    closeTimer.current = window.setTimeout(() => setHistoryOpen(false), 300)
  }

  useEffect(() => cancelClose, [])

  useEffect(() => {
    setHistoryOpen(false)
  }, [composerFocusRequest])

  useEffect(() => {
    if (!historyOpen) {
      deleteDialogOpen.current = false
      return
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented && !deleteDialogOpen.current) setHistoryOpen(false)
    }
    // Track the pointer over the portal too; the modal overlay hides the
    // sheet from hover events until the dialog has finished closing.
    const onPointer = (event: PointerEvent): void => {
      pointerPosition.current = { x: event.clientX, y: event.clientY }
      if (deleteDialogOpen.current) return
      // Removing an overlay under a stationary pointer does not guarantee
      // a new mouse-enter/leave pair for the uncovered sheet.
      if (pointerOverHistory()) cancelClose()
      else if (closeTimer.current == null) scheduleClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointermove', onPointer, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointermove', onPointer, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
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
            ref={historyTriggerRef}
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
        <ChatPanel
          chat={chat}
          draft={composerDraft}
          setDraft={setComposerDraft}
          codexConnected={codex.connected}
          onOpenSettings={onOpenSettings}
          onAssistantAction={onAssistantAction}
          focusRequest={composerFocusRequest}
          typeToFocus
          onTypeToFocus={() => setHistoryOpen(false)}
        />
      </div>

      {/* A floating card, not an edge-flush sheet: inset from the edges with
          the app's panel recipe (rounded, hairline, diffusion shadow) so it
          reads as a temporary layer above the page. It rises over the header
          buttons like a native menu, so its header carries its own new-chat
          affordance while open. */}
      <AnimatePresence>
        {historyOpen && (
          <motion.aside
            ref={historyRef}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onFocusCapture={cancelClose}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose()
            }}
            className="absolute bottom-3 right-3 top-1.5 z-30 flex w-[300px] flex-col overflow-hidden rounded-[22px] border border-hairline bg-panel/75 shadow-[0_20px_50px_-30px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.05)] backdrop-blur-2xl"
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
            <ChatHistory
              chat={chat}
              onNavigate={() => setHistoryOpen(false)}
              onDeleteDialogOpenChange={(open) => {
                deleteDialogOpen.current = open
                if (open) cancelClose()
              }}
              onDeleteDialogCloseAutoFocus={(event, openedWithKeyboard) => {
                if (openedWithKeyboard) return
                // Pointer use should resume hover dismissal, rather than
                // focus a row and pin the sheet open. Keyboard use keeps the
                // shared dialog's row/fallback focus restoration.
                event.preventDefault()
                historyTriggerRef.current?.focus({ preventScroll: true })
                if (!pointerOverHistory()) scheduleClose()
              }}
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  )
}

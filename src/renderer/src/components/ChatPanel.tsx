// The chat conversation UI, shared by the full Assistant page and the
// slide-over sheet. The chat state itself lives in App so both surfaces
// show the same conversation.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUp,
  Sparkle,
  Heartbeat,
  Moon,
  PersonSimpleRun,
  Pulse,
  type Icon
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Markdownish } from '@/components/Markdownish'
import type { ChatController, ChatTurn } from '@/hooks/useChat'
import { cn } from '@/lib/utils'

// Each starter question wears its metric family's hue — the same rule the
// rest of the app follows: color identifies the metric, never the value.
const SUGGESTIONS: Array<{ text: string; icon: Icon; iconClass: string; tintClass: string }> = [
  {
    text: 'How did I sleep this week compared to last night?',
    icon: Moon,
    iconClass: 'text-sleep',
    tintClass: 'bg-sleep-soft'
  },
  {
    text: 'Is my resting heart rate trending up or down?',
    icon: Heartbeat,
    iconClass: 'text-heart',
    tintClass: 'bg-heart-soft'
  },
  {
    text: 'How active have I been the last two weeks?',
    icon: PersonSimpleRun,
    iconClass: 'text-activity',
    tintClass: 'bg-activity-soft'
  },
  {
    text: 'Any anomalies in my HRV I should watch?',
    icon: Pulse,
    iconClass: 'text-recovery',
    tintClass: 'bg-recovery-soft'
  }
]

export type ChatState = ChatController

interface ChatPanelProps {
  chat: ChatState
  codexConnected: boolean
  onOpenSettings: () => void
  compact?: boolean
  autoFocus?: boolean
  typeToFocus?: boolean
  onTypeToFocus?: () => void
}

export function ChatPanel({
  chat,
  codexConnected,
  onOpenSettings,
  compact,
  autoFocus = true,
  typeToFocus = false,
  onTypeToFocus
}: ChatPanelProps): React.JSX.Element {
  const { turns, busy, loading, activeChatId, send } = chat
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        // Repeated smooth-scroll animations fight each other on every token.
        behavior: busy ? 'auto' : 'smooth'
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [turns, busy])

  useEffect(() => {
    if (codexConnected && autoFocus) inputRef.current?.focus()
  }, [activeChatId, autoFocus, codexConnected])

  useEffect(() => {
    setDraft('')
  }, [activeChatId])

  useEffect(() => {
    if (!typeToFocus || !codexConnected || loading || !activeChatId) return

    const focusComposer = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.key.length !== 1
      ) {
        return
      }

      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
      if (document.querySelector('[role="dialog"]')) return

      event.preventDefault()
      onTypeToFocus?.()
      inputRef.current?.focus()
      setDraft((current) => current + event.key)
    }

    window.addEventListener('keydown', focusComposer)
    return () => window.removeEventListener('keydown', focusComposer)
  }, [activeChatId, codexConnected, loading, onTypeToFocus, typeToFocus])

  const submit = (): void => {
    if (!draft.trim() || busy) return
    send(draft)
    setDraft('')
  }

  if (!codexConnected) {
    return <SignInPrompt onOpenSettings={onOpenSettings} compact={compact} />
  }

  if (loading || !activeChatId) {
    return <div className="grid h-full place-items-center"><ToolThinking label="Loading conversations" /></div>
  }

  const empty = turns.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-4">
        {empty ? (
          <div className={cn('h-full', compact ? 'px-4' : 'mx-auto w-full max-w-[820px] px-6')}>
            <EmptyState compact={compact} onPick={(s) => send(s)} />
          </div>
        ) : (
          <div
            className={cn(
              'flex flex-col gap-5 py-3',
              compact ? 'px-4' : 'mx-auto w-full max-w-[820px] px-6'
            )}
          >
            <AnimatePresence initial={false}>
              {turns.map((turn) => (
                <Bubble key={turn.id} turn={turn} compact={compact} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className={cn('pb-4 pt-1', compact ? 'px-3' : 'mx-auto w-full max-w-[820px] px-6')}>
        <div className="flex items-end gap-2 rounded-[18px] border border-hairline bg-panel/80 p-2 pl-4 shadow-[0_12px_40px_-24px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-colors focus-within:border-hairline-strong">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            placeholder="Ask about your health data…"
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-faint select-text"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`
            }}
          />
          <Button
            size="sm"
            onClick={submit}
            disabled={!draft.trim() || busy || loading}
            className="h-8 w-8 shrink-0 rounded-full px-0"
            aria-label="Send"
          >
            <ArrowUp size={16} weight="bold" />
          </Button>
        </div>
        {!compact && (
          <p className="mt-2 text-center text-[11px] text-ink-faint">
            OpenPulse reads your Fitbit data to answer. Not a substitute for medical advice.
          </p>
        )}
      </div>
    </div>
  )
}

function Bubble({ turn, compact }: { turn: ChatTurn; compact?: boolean }): React.JSX.Element {
  const isUser = turn.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      {isUser ? (
        <div className="max-w-[80%] rounded-[16px] rounded-br-md bg-accent px-4 py-2.5 text-[13px] leading-relaxed text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] select-text">
          {turn.text}
        </div>
      ) : (
        <div className={cn('w-full min-w-0 select-text', compact ? 'max-w-full' : 'max-w-[88%]')}>
          {turn.toolLabel && !turn.text ? (
            <ToolThinking label={turn.toolLabel} />
          ) : turn.streaming && !turn.text ? (
            <ToolThinking label="Thinking" />
          ) : turn.error ? (
            <div className="rounded-[16px] border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
              {turn.text}
            </div>
          ) : (
            <Markdownish text={turn.text} />
          )}
        </div>
      )}
    </motion.div>
  )
}

function ToolThinking({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50" />
        <span className="relative inline-flex size-2 rounded-full bg-accent/90" />
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.18 }}
          className="thinking-shimmer font-medium"
        >
          {label}…
        </motion.span>
      </AnimatePresence>
    </div>
  )
}

function EmptyState({ compact, onPick }: { compact?: boolean; onPick: (s: string) => void }): React.JSX.Element {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[#a5a3ff] shadow-[0_10px_30px_-10px_rgb(125_123_240/0.7),inset_0_1px_0_rgb(255_255_255/0.3)]"
      >
        <Sparkle size={24} weight="fill" className="text-white" />
      </motion.div>
      <h2 className="display mt-5 text-[18px] font-bold text-ink">Ask about your health</h2>
      <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink-dim">
        I can read your activity, vitals, sleep, and body data — for any day — to spot trends and answer
        questions.
      </p>
      <div className={cn('mt-6 grid w-full gap-2', compact ? 'grid-cols-1' : 'max-w-lg grid-cols-1 sm:grid-cols-2')}>
        {SUGGESTIONS.map((suggestion, i) => {
          const SuggestionIcon = suggestion.icon
          return (
            <motion.button
              key={suggestion.text}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, duration: 0.4 }}
              onClick={() => onPick(suggestion.text)}
              className="group flex items-start gap-3 rounded-2xl border border-hairline bg-white/[0.03] px-3.5 py-3 text-left text-[12.5px] leading-snug text-ink-dim transition-all duration-200 hover:-translate-y-px hover:border-hairline-strong hover:bg-white/[0.06] hover:text-ink"
            >
              <span
                className={cn(
                  'mt-px grid size-6 shrink-0 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110',
                  suggestion.tintClass
                )}
              >
                <SuggestionIcon size={13} weight="fill" className={suggestion.iconClass} />
              </span>
              {suggestion.text}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}

function SignInPrompt({ onOpenSettings, compact }: { onOpenSettings: () => void; compact?: boolean }): React.JSX.Element {
  return (
    <div className={cn('grid h-full place-items-center', compact ? 'px-5' : 'px-8')}>
      <div className="max-w-sm text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft">
          <Sparkle size={24} weight="fill" className="text-accent" />
        </div>
        <h2 className="display mt-5 text-[17px] font-bold text-ink">Connect ChatGPT</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
          Sign in with your ChatGPT account to unlock the assistant. It runs on your existing plan — no
          separate API key needed.
        </p>
        <Button className="mt-5" onClick={onOpenSettings}>
          <Heartbeat size={15} weight="fill" /> Open Settings
        </Button>
      </div>
    </div>
  )
}

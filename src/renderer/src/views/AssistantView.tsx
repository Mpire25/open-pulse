import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Sparkle, Broom, Heartbeat } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Markdownish } from '@/components/Markdownish'
import { useChat, type ChatTurn } from '@/hooks/useChat'
import type { CodexAuthStatus } from '@shared/types'
import { cn } from '@/lib/utils'

const SUGGESTIONS = [
  'How did I sleep this week compared to last night?',
  'Is my resting heart rate trending up or down?',
  'What should I focus on to close my rings today?',
  'Any anomalies in my HRV I should watch?'
]

interface AssistantViewProps {
  codex: CodexAuthStatus
  onOpenSettings: () => void
}

export function AssistantView({ codex, onOpenSettings }: AssistantViewProps): React.JSX.Element {
  const { turns, busy, send, reset } = useChat()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  useEffect(() => {
    if (codex.connected) inputRef.current?.focus()
  }, [codex.connected])

  const submit = (): void => {
    if (!draft.trim() || busy) return
    send(draft)
    setDraft('')
  }

  if (!codex.connected) {
    return <SignInPrompt onOpenSettings={onOpenSettings} />
  }

  const empty = turns.length === 0

  return (
    <div className="mx-auto flex h-full max-w-[820px] flex-col px-6">
      <div className="drag-region flex items-center justify-between pb-3 pt-3">
        <div className="no-drag flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-accent-soft">
            <Sparkle size={14} weight="fill" className="text-accent" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Assistant</span>
        </div>
        {!empty && (
          <Button variant="ghost" size="sm" onClick={reset} className="no-drag">
            <Broom size={14} /> New chat
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-4">
        {empty ? (
          <EmptyState draft={draft} onPick={(s) => send(s)} />
        ) : (
          <div className="flex flex-col gap-5 py-2">
            <AnimatePresence initial={false}>
              {turns.map((turn) => (
                <Bubble key={turn.id} turn={turn} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="pb-6 pt-1">
        <div className="flex items-end gap-2 rounded-[20px] border border-hairline bg-panel/80 p-2 pl-4 shadow-[0_12px_40px_-24px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-colors focus-within:border-hairline-strong">
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
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-faint select-text"
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
            disabled={!draft.trim() || busy}
            className="h-8 w-8 shrink-0 rounded-full px-0"
            aria-label="Send"
          >
            <ArrowUp size={16} weight="bold" />
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-ink-faint">
          OpenPulse reads your Fitbit data to answer. Not a substitute for medical advice.
        </p>
      </div>
    </div>
  )
}

function Bubble({ turn }: { turn: ChatTurn }): React.JSX.Element {
  const isUser = turn.role === 'user'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26 }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      {isUser ? (
        <div className="max-w-[80%] rounded-[18px] rounded-br-md bg-accent px-4 py-2.5 text-[13.5px] leading-relaxed text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)] select-text">
          {turn.text}
        </div>
      ) : (
        <div className="max-w-[88%] select-text">
          {turn.toolLabel && !turn.text ? (
            <ToolThinking label={turn.toolLabel} />
          ) : turn.error ? (
            <div className="rounded-[16px] border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
              {turn.text}
            </div>
          ) : (
            <>
              <Markdownish text={turn.text} />
              {turn.streaming && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-1 animate-pulse bg-accent" />}
            </>
          )}
        </div>
      )}
    </motion.div>
  )
}

function ToolThinking({ label }: { label: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-[13px] text-ink-dim">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      {label}…
    </div>
  )
}

function EmptyState({
  onPick
}: {
  draft: string
  onPick: (s: string) => void
}): React.JSX.Element {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-[#5eb1ff] shadow-[0_10px_30px_-10px_rgb(10_132_255/0.7),inset_0_1px_0_rgb(255_255_255/0.3)]"
      >
        <Sparkle size={26} weight="fill" className="text-white" />
      </motion.div>
      <h2 className="mt-5 text-[20px] font-semibold tracking-tight text-ink">Ask about your health</h2>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-dim">
        I can read your steps, heart rate, HRV, and sleep to spot trends and answer questions.
      </p>
      <div className="mt-7 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06, duration: 0.4 }}
            onClick={() => onPick(s)}
            className="rounded-2xl border border-hairline bg-white/[0.03] px-4 py-3 text-left text-[13px] leading-snug text-ink-dim transition-all duration-200 hover:-translate-y-px hover:border-hairline-strong hover:bg-white/[0.06] hover:text-ink"
          >
            {s}
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function SignInPrompt({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
  return (
    <div className="grid h-full place-items-center px-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft">
          <Sparkle size={26} weight="fill" className="text-accent" />
        </div>
        <h2 className="mt-5 text-[19px] font-semibold tracking-tight text-ink">Connect ChatGPT</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-dim">
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

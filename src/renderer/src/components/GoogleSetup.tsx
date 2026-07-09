import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowClockwise, ArrowSquareOut, GoogleLogo, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AppLogo } from '@/components/AppLogo'
import type { GoogleAuthStatus } from '@shared/types'

interface Step {
  title: string
  body: React.ReactNode
  link?: { label: string; href: string }
}

const STEPS: Step[] = [
  {
    title: 'Enable the Google Health API',
    body: 'In Google Cloud Console, create a project and enable the Health API.',
    link: { label: 'Google Cloud Console', href: 'https://console.cloud.google.com/apis/library/health.googleapis.com' }
  },
  {
    title: 'Create an OAuth client ID',
    body: (
      <>
        Type <span className="text-ink">Desktop app</span>. On the consent screen, add this browser's Google
        account under <span className="text-ink">Audience / Test users</span>.
      </>
    ),
    link: { label: 'Credentials', href: 'https://console.cloud.google.com/apis/credentials' }
  },
  {
    title: 'Paste the Client ID below',
    body: 'Ends in .apps.googleusercontent.com — no client secret needed.'
  }
]

interface GoogleSetupProps {
  initialClientId: string
  onConnected: (status: GoogleAuthStatus) => void
  onClientIdChange?: (clientId: string) => void
  /** Show the logo + title header (used in the floating overlay, hidden in Settings). */
  showHeader?: boolean
}

export function GoogleSetup({
  initialClientId,
  onConnected,
  onClientIdChange,
  showHeader = true
}: GoogleSetupProps): React.JSX.Element {
  const [clientId, setClientId] = useState(initialClientId)
  const [busy, setBusy] = useState(false)
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const attemptRef = useRef(0)

  const connect = async (): Promise<void> => {
    const trimmed = clientId.trim()
    if (!trimmed || (busy && trimmed === activeClientId)) return
    const attempt = attemptRef.current + 1
    attemptRef.current = attempt
    setError(null)
    setBusy(true)
    setActiveClientId(trimmed)
    try {
      await window.pulse.settings.update({ googleClientId: trimmed })
      onClientIdChange?.(trimmed)
      const status = await window.pulse.google.connect()
      if (attemptRef.current === attempt) onConnected(status)
    } catch (err) {
      if (attemptRef.current === attempt) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (attemptRef.current === attempt) {
        setBusy(false)
        setActiveClientId(null)
      }
    }
  }

  const trimmedClientId = clientId.trim()
  const clientIdChangedDuringConnect = busy && Boolean(activeClientId) && trimmedClientId !== activeClientId

  return (
    <div className="w-full">
      {showHeader && (
        <div className="mb-5 flex items-center gap-2.5">
          <AppLogo size={34} />
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-ink">Connect your Fitbit Air</h2>
            <p className="text-[12.5px] text-ink-dim">Showing sample data until you link Google Health.</p>
          </div>
        </div>
      )}

      <ol className="flex flex-col gap-3.5">
        {STEPS.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/[0.06] font-mono text-[11px] font-semibold text-ink-dim">
              {i + 1}
            </span>
            <div className="flex-1">
              <p className="text-[13px] font-medium text-ink">{step.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-dim">{step.body}</p>
              {step.link && (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="no-drag mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-accent transition-opacity hover:opacity-80"
                >
                  {step.link.label}
                  <ArrowSquareOut size={12} weight="bold" />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-5 flex flex-col gap-2">
        <Input
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && void connect()}
          placeholder="Client ID · xxxx.apps.googleusercontent.com"
          spellCheck={false}
        />
        {busy && (
          <p className="text-[12px] leading-relaxed text-ink-dim">
            Waiting for Google. This will time out in about a minute; edit the Client ID to retry now.
          </p>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger"
          >
            <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
            {error}
          </motion.div>
        )}
        <Button className="mt-1 w-full" onClick={connect} disabled={!trimmedClientId || (busy && !clientIdChangedDuringConnect)}>
          {busy ? <ArrowClockwise size={15} className="animate-spin" /> : <GoogleLogo size={15} weight="bold" />}
          {clientIdChangedDuringConnect ? 'Retry with New Client ID' : busy ? 'Waiting for Google…' : 'Connect Google Health'}
        </Button>
      </div>
    </div>
  )
}

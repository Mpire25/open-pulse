import { useState } from 'react'
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
        Type <span className="text-ink">Desktop app</span>. Add your Google account as a test user on the
        consent screen.
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
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<void> => {
    const trimmed = clientId.trim()
    if (!trimmed || busy) return
    setError(null)
    setBusy(true)
    try {
      await window.pulse.settings.update({ googleClientId: trimmed })
      onClientIdChange?.(trimmed)
      onConnected(await window.pulse.google.connect())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

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
          onChange={(e) => setClientId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void connect()}
          placeholder="Client ID · xxxx.apps.googleusercontent.com"
          spellCheck={false}
        />
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
        <Button className="mt-1 w-full" onClick={connect} disabled={busy || !clientId.trim()}>
          {busy ? <ArrowClockwise size={15} className="animate-spin" /> : <GoogleLogo size={15} weight="bold" />}
          {busy ? 'Waiting for Google…' : 'Connect Google Health'}
        </Button>
      </div>
    </div>
  )
}

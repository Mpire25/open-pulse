import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowClockwise, ArrowSquareOut, Check, Copy, GoogleLogo, Warning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AppLogo } from '@/components/AppLogo'
import type { GoogleAuthStatus } from '@shared/types'

const GOOGLE_REDIRECT_URI = 'http://127.0.0.1:42813/oauth/callback'

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
        Type <span className="text-ink">Web application</span>. Add this exact redirect URI:
        <CopyRedirectUri />.
      </>
    ),
    link: { label: 'Credentials', href: 'https://console.cloud.google.com/apis/credentials' }
  },
  {
    title: 'Paste the credentials below',
    body: 'Use the Client ID and Client Secret from that same Web application OAuth client.'
  }
]

function formatConnectError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method 'google:connect': Error:\s*/, '')
}

function CopyRedirectUri(): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(GOOGLE_REDIRECT_URI)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="no-drag ml-1 inline-flex items-center gap-1 rounded-md border border-hairline bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] leading-none text-ink transition-colors hover:border-accent/50 hover:bg-accent/10"
      title="Copy redirect URI"
    >
      {copied ? <Check size={11} weight="bold" /> : <Copy size={11} weight="bold" />}
      {copied ? 'Copied' : GOOGLE_REDIRECT_URI}
    </button>
  )
}

interface GoogleSetupProps {
  initialClientId: string
  clientSecretConfigured: boolean
  onConnected: (status: GoogleAuthStatus) => void
  onCredentialsChange?: (clientId: string, clientSecretConfigured: boolean) => void
  /** Show the logo + title header (used in the floating overlay, hidden in Settings). */
  showHeader?: boolean
}

export function GoogleSetup({
  initialClientId,
  clientSecretConfigured,
  onConnected,
  onCredentialsChange,
  showHeader = true
}: GoogleSetupProps): React.JSX.Element {
  const [clientId, setClientId] = useState(initialClientId)
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeCredentialKey, setActiveCredentialKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const attemptRef = useRef(0)

  const connect = async (): Promise<void> => {
    const trimmed = clientId.trim()
    const trimmedSecret = clientSecret.trim()
    const credentialKey = `${trimmed}\n${trimmedSecret || clientSecretConfigured}`
    if (!trimmed || (busy && credentialKey === activeCredentialKey)) return
    const attempt = attemptRef.current + 1
    attemptRef.current = attempt
    setError(null)
    setBusy(true)
    setActiveCredentialKey(credentialKey)
    try {
      const patch = trimmedSecret
        ? { googleClientId: trimmed, googleClientSecret: trimmedSecret }
        : { googleClientId: trimmed }
      const updatedSettings = await window.pulse.settings.update(patch)
      onCredentialsChange?.(trimmed, updatedSettings.googleClientSecretConfigured)
      const status = await window.pulse.google.connect()
      if (attemptRef.current === attempt) onConnected(status)
    } catch (err) {
      if (attemptRef.current === attempt) setError(formatConnectError(err))
    } finally {
      if (attemptRef.current === attempt) {
        setBusy(false)
        setActiveCredentialKey(null)
      }
    }
  }

  const trimmedClientId = clientId.trim()
  const currentCredentialKey = `${trimmedClientId}\n${clientSecret.trim() || clientSecretConfigured}`
  const credentialsChangedDuringConnect =
    busy && Boolean(activeCredentialKey) && currentCredentialKey !== activeCredentialKey

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
        <Input
          value={clientSecret}
          onChange={(e) => {
            setClientSecret(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && void connect()}
          placeholder={clientSecretConfigured ? 'Client secret saved · type to replace' : 'Client secret'}
          spellCheck={false}
          type="password"
        />
        {busy && (
          <p className="text-[12px] leading-relaxed text-ink-dim">
            Waiting for Google. This will time out in about a minute; edit the credentials to retry now.
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
        <Button className="mt-1 w-full" onClick={connect} disabled={!trimmedClientId || (busy && !credentialsChangedDuringConnect)}>
          {busy ? <ArrowClockwise size={15} className="animate-spin" /> : <GoogleLogo size={15} weight="bold" />}
          {credentialsChangedDuringConnect ? 'Retry with New Credentials' : busy ? 'Waiting for Google…' : 'Connect Google Health'}
        </Button>
      </div>
    </div>
  )
}

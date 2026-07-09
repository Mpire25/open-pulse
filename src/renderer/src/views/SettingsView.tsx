import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, GoogleLogo, Sparkle, Target, ArrowClockwise, Warning } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GoogleSetup } from '@/components/GoogleSetup'
import type { AppSettings, CodexAuthStatus, Goals, GoogleAuthStatus } from '@shared/types'

interface SettingsViewProps {
  settings: AppSettings
  google: GoogleAuthStatus
  codex: CodexAuthStatus
  onSettingsChange: (settings: AppSettings) => void
  onGoogleChange: (status: GoogleAuthStatus) => void
  onCodexChange: (status: CodexAuthStatus) => void
}

export function SettingsView({
  settings,
  google,
  codex,
  onSettingsChange,
  onGoogleChange,
  onCodexChange
}: SettingsViewProps): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-8 pb-12">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="pt-2"
      >
        <h1 className="display text-[27px] font-bold text-ink">Settings</h1>
        <p className="mt-1 text-[13px] text-ink-dim">Accounts and daily goals.</p>
      </motion.header>

      <GoogleCard
        settings={settings}
        google={google}
        onSettingsChange={onSettingsChange}
        onGoogleChange={onGoogleChange}
      />
      <CodexCard codex={codex} onCodexChange={onCodexChange} />
      <GoalsCard settings={settings} onSettingsChange={onSettingsChange} />
    </div>
  )
}

function GoalsCard({
  settings,
  onSettingsChange
}: {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<Goals>(settings.goals)
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.goals)

  const save = async (): Promise<void> => {
    const next = await window.pulse.settings.update({ goals: draft })
    onSettingsChange(next)
    setDraft(next.goals)
  }

  const field = (
    key: keyof Goals,
    label: string,
    unit: string
  ): React.JSX.Element => (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium text-ink-faint">
        {label} <span className="text-ink-faint/70">({unit})</span>
      </span>
      <Input
        type="number"
        min={1}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
      />
    </label>
  )

  return (
    <Card index={2}>
      <SectionHeader
        title="Daily goals"
        hint="Used for the rings and the goal lines on charts"
        icon={<Target size={18} weight="fill" className="text-recovery" />}
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {field('steps', 'Steps', 'count')}
        {field('activeZoneMinutes', 'Zone minutes', 'min')}
        {field('caloriesOut', 'Calories', 'kcal')}
        {field('sleepMinutes', 'Sleep', 'min')}
      </div>
      {dirty && (
        <div>
          <Button size="sm" onClick={save}>
            Save goals
          </Button>
        </div>
      )}
    </Card>
  )
}

function StatusPill({ connected, text }: { connected: boolean; text: string }): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        connected ? 'bg-[#30d158]/15 text-[#4fd979]' : 'bg-white/8 text-ink-dim'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#30d158]' : 'bg-ink-faint'}`} />
      {text}
    </span>
  )
}

function GoogleCard({
  settings,
  google,
  onSettingsChange,
  onGoogleChange
}: {
  settings: AppSettings
  google: GoogleAuthStatus
  onSettingsChange: (s: AppSettings) => void
  onGoogleChange: (s: GoogleAuthStatus) => void
}): React.JSX.Element {
  const disconnect = async (): Promise<void> => {
    await window.pulse.google.disconnect()
    onGoogleChange({ connected: false })
  }

  return (
    <Card index={0}>
      <SectionHeader
        title="Google Health"
        hint="Sync your Fitbit Air via the Google Health API"
        icon={<GoogleLogo size={18} weight="bold" className="text-ink-dim" />}
        action={<StatusPill connected={google.connected} text={google.connected ? 'Connected' : 'Not connected'} />}
      />

      {google.connected ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[13px] text-ink-dim">
            <CheckCircle size={16} weight="fill" className="text-[#4fd979]" />
            Signed in{google.email ? ` as ${google.email}` : ''}
          </div>
          <div>
            <Button variant="destructive" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <GoogleSetup
          showHeader={false}
          initialClientId={settings.googleClientId}
          clientSecretConfigured={settings.googleClientSecretConfigured}
          onConnected={onGoogleChange}
          onCredentialsChange={(googleClientId, googleClientSecretConfigured) =>
            onSettingsChange({ ...settings, googleClientId, googleClientSecretConfigured })
          }
        />
      )}
    </Card>
  )
}

function CodexCard({
  codex,
  onCodexChange
}: {
  codex: CodexAuthStatus
  onCodexChange: (s: CodexAuthStatus) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      onCodexChange(await window.pulse.codex.connect())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (): Promise<void> => {
    await window.pulse.codex.disconnect()
    onCodexChange({ connected: false })
  }

  return (
    <Card index={1}>
      <SectionHeader
        title="AI Assistant"
        hint="Sign in with ChatGPT to power insights"
        icon={<Sparkle size={18} weight="fill" className="text-accent" />}
        action={
          <StatusPill
            connected={codex.connected}
            text={codex.connected ? codex.planType ?? 'Connected' : 'Not connected'}
          />
        }
      />
      {codex.connected ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[13px] text-ink-dim">
            <CheckCircle size={16} weight="fill" className="text-[#4fd979]" />
            Signed in{codex.email ? ` as ${codex.email}` : ''}
          </div>
          <div>
            <Button variant="destructive" size="sm" onClick={disconnect}>
              Sign out
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] leading-relaxed text-ink-faint">
            Uses the ChatGPT Codex OAuth flow. The assistant runs on your existing ChatGPT plan — no API
            key required. A browser window opens for you to authorize.
          </p>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <Button onClick={connect} disabled={busy}>
              {busy ? <ArrowClockwise size={15} className="animate-spin" /> : <Sparkle size={15} weight="fill" />}
              {busy ? 'Waiting for ChatGPT…' : 'Sign in with ChatGPT'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function Card({ index, children }: { index: number; children: React.ReactNode }): React.JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <Panel className="flex flex-col gap-5 p-6">{children}</Panel>
    </motion.div>
  )
}

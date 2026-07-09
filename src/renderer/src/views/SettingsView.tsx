import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, GoogleLogo, Sparkle, Watch, ArrowClockwise, Warning } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { AppSettings, CodexAuthStatus, GoogleAuthStatus, PairedDevice } from '@shared/types'

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
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[13px] text-ink-dim">Connect your accounts and tune your goals.</p>
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
  const [clientId, setClientId] = useState(settings.googleClientId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<PairedDevice[]>([])

  useEffect(() => {
    if (google.connected) window.pulse.health.devices().then(setDevices)
  }, [google.connected])

  const saveClientId = async (): Promise<void> => {
    const updated = await window.pulse.settings.update({ googleClientId: clientId.trim() })
    onSettingsChange(updated)
  }

  const connect = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await saveClientId()
      const status = await window.pulse.google.connect()
      onGoogleChange(status)
      // Connecting live data implies leaving demo mode.
      const updated = await window.pulse.settings.update({ demoMode: false })
      onSettingsChange(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async (): Promise<void> => {
    await window.pulse.google.disconnect()
    onGoogleChange({ connected: false })
    const updated = await window.pulse.settings.update({ demoMode: true })
    onSettingsChange(updated)
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
          {devices.length > 0 && (
            <div className="flex flex-col divide-y divide-hairline rounded-xl border border-hairline bg-white/[0.02]">
              {devices.map((d) => (
                <div key={d.name} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Watch size={17} className="text-ink-dim" />
                    <div>
                      <div className="text-[13px] font-medium text-ink">{d.name}</div>
                      <div className="text-[11px] text-ink-faint">{d.model}</div>
                    </div>
                  </div>
                  {d.batteryPct != null && (
                    <span className="font-mono text-[12px] text-ink-dim">{d.batteryPct}%</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            <Button variant="destructive" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-ink-dim">OAuth Client ID</label>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxx.apps.googleusercontent.com"
              spellCheck={false}
            />
            <p className="text-[11px] leading-relaxed text-ink-faint">
              Create a <span className="text-ink-dim">Desktop app</span> OAuth client in Google Cloud
              Console with the Health API enabled, then paste its Client ID. The app uses a loopback PKCE
              flow, so no client secret is stored.
            </p>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <Button onClick={connect} disabled={busy || !clientId.trim()}>
              {busy ? <ArrowClockwise size={15} className="animate-spin" /> : <GoogleLogo size={15} weight="bold" />}
              {busy ? 'Waiting for Google…' : 'Connect Google Health'}
            </Button>
          </div>
        </div>
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

function GoalsCard({
  settings,
  onSettingsChange
}: {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
}): React.JSX.Element {
  const update = async (patch: Partial<AppSettings>): Promise<void> => {
    onSettingsChange(await window.pulse.settings.update(patch))
  }

  const setGoal = (key: keyof AppSettings['goals'], value: number): void => {
    void update({ goals: { ...settings.goals, [key]: value } })
  }

  return (
    <Card index={2}>
      <SectionHeader title="Daily goals" hint="Targets for your activity rings" />
      <div className="flex flex-col divide-y divide-hairline">
        <GoalRow
          label="Move"
          unit="kcal"
          color="var(--color-move)"
          value={settings.goals.activeEnergyKcal}
          step={50}
          onChange={(v) => setGoal('activeEnergyKcal', v)}
        />
        <GoalRow
          label="Exercise"
          unit="min"
          color="var(--color-exercise)"
          value={settings.goals.activeZoneMinutes}
          step={5}
          onChange={(v) => setGoal('activeZoneMinutes', v)}
        />
        <GoalRow
          label="Steps"
          unit="steps"
          color="var(--color-stand)"
          value={settings.goals.steps}
          step={500}
          onChange={(v) => setGoal('steps', v)}
        />
      </div>

      <div className="mt-2 flex items-center justify-between rounded-xl border border-hairline bg-white/[0.02] px-4 py-3">
        <div>
          <div className="text-[13px] font-medium text-ink">Demo mode</div>
          <div className="text-[11px] text-ink-faint">Explore with realistic sample data</div>
        </div>
        <Switch
          checked={settings.demoMode}
          onCheckedChange={(checked) => void update({ demoMode: checked })}
        />
      </div>
    </Card>
  )
}

function GoalRow({
  label,
  unit,
  color,
  value,
  step,
  onChange
}: {
  label: string
  unit: string
  color: string
  value: number
  step: number
  onChange: (v: number) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0">
      <div className="flex items-center gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        <span className="text-[13px] font-medium text-ink">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(step, value - step))}
          className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-ink-dim transition-colors hover:bg-white/10 hover:text-ink active:scale-95"
        >
          −
        </button>
        <div className="flex w-24 items-baseline justify-center gap-1">
          <span className="font-mono text-[15px] font-medium text-ink">
            {new Intl.NumberFormat('en-US').format(value)}
          </span>
          <span className="text-[11px] text-ink-faint">{unit}</span>
        </div>
        <button
          onClick={() => onChange(value + step)}
          className="grid h-7 w-7 place-items-center rounded-lg bg-white/5 text-ink-dim transition-colors hover:bg-white/10 hover:text-ink active:scale-95"
        >
          +
        </button>
      </div>
    </div>
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

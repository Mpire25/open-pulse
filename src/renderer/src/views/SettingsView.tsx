import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Brain, ChatCircleDots, CheckCircle, GoogleLogo, Sparkle, Target, ArrowClockwise, Warning } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GoogleSetup } from '@/components/GoogleSetup'
import { cn } from '@/lib/utils'
import {
  ASSISTANT_MODEL_PATTERN,
  ASSISTANT_MODEL_PRESETS,
  DEFAULT_ASSISTANT,
  REASONING_EFFORTS,
  type AppSettings,
  type AssistantSettings,
  type ChatRetention,
  type CodexAuthStatus,
  type Goals,
  type GoogleAuthStatus,
  type ReasoningEffort
} from '@shared/types'

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
      <AssistantCard settings={settings} onSettingsChange={onSettingsChange} />
      <ChatRetentionCard settings={settings} onSettingsChange={onSettingsChange} />
      <GoalsCard settings={settings} onSettingsChange={onSettingsChange} />
    </div>
  )
}

const RETENTION_OPTIONS: Array<{ value: ChatRetention; label: string }> = [
  { value: 'session', label: 'When app closes' },
  { value: '24-hours', label: '24 hours' },
  { value: '7-days', label: '7 days' },
  { value: '30-days', label: '30 days' },
  { value: 'forever', label: 'Forever' }
]

function ChatRetentionCard({
  settings,
  onSettingsChange
}: {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
}): React.JSX.Element {
  const selectRetention = async (chatRetention: ChatRetention): Promise<void> => {
    onSettingsChange(await window.pulse.settings.update({ chatRetention }))
  }

  return (
    <Card index={3}>
      <SectionHeader
        title="Chat retention"
        hint="Applies globally to chats that you haven't kept"
        icon={<ChatCircleDots size={18} weight="fill" className="text-accent" />}
      />
      <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-white/[0.03] p-0.5">
        {RETENTION_OPTIONS.map((option) => (
          <Pill
            key={option.value}
            active={settings.chatRetention === option.value}
            layoutId="chat-retention-active"
            onClick={() => void selectRetention(option.value)}
          >
            {option.label}
          </Pill>
        ))}
      </div>
      <p className="text-[11px] text-ink-faint">
        Pinned and kept chats are never removed. When set to Forever, all chats are kept automatically.
      </p>
    </Card>
  )
}

const PRESET_IDS = new Set<string>(ASSISTANT_MODEL_PRESETS.map((m) => m.id))
const EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max'
}

/** A custom model's ladder is unknown, so offer the full set and let it 400. */
function effortsForModel(model: string): ReasoningEffort[] {
  return ASSISTANT_MODEL_PRESETS.find((m) => m.id === model)?.efforts ?? REASONING_EFFORTS
}

function Pill({
  active,
  layoutId,
  onClick,
  children
}: {
  active: boolean
  layoutId: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative rounded-[10px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
        active ? 'text-ink' : 'text-ink-dim hover:text-ink'
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-[10px] border border-hairline bg-white/[0.08]"
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

function AssistantCard({
  settings,
  onSettingsChange
}: {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
}): React.JSX.Element {
  const [assistant, setAssistant] = useState<AssistantSettings>(settings.assistant)
  const [custom, setCustom] = useState(() => !PRESET_IDS.has(settings.assistant.model))
  const [customModel, setCustomModel] = useState(() =>
    PRESET_IDS.has(settings.assistant.model) ? '' : settings.assistant.model
  )
  const saveSequence = useRef(0)
  const trimmedCustomModel = customModel.trim()
  const customDirty = trimmedCustomModel !== assistant.model
  const customValid = ASSISTANT_MODEL_PATTERN.test(trimmedCustomModel)
  const efforts = custom ? REASONING_EFFORTS : effortsForModel(assistant.model)

  const persist = async (nextAssistant: AssistantSettings): Promise<void> => {
    const sequence = ++saveSequence.current
    setAssistant(nextAssistant)

    const next = await window.pulse.settings.update({ assistant: nextAssistant })
    if (sequence !== saveSequence.current) return

    onSettingsChange(next)
    setAssistant(next.assistant)
    const savedIsCustom = !PRESET_IDS.has(next.assistant.model)
    setCustom(savedIsCustom)
    setCustomModel(savedIsCustom ? next.assistant.model : '')
  }

  // Keep the pair valid when a model drops a tier (Luna has no ultra).
  const selectModel = (model: string): void => {
    const supported = effortsForModel(model)
    void persist({
      model,
      reasoningEffort: supported.includes(assistant.reasoningEffort)
        ? assistant.reasoningEffort
        : DEFAULT_ASSISTANT.reasoningEffort
    })
  }

  const selectEffort = (reasoningEffort: ReasoningEffort): void => {
    void persist({ ...assistant, reasoningEffort })
  }

  const applyCustomModel = (): void => {
    if (!customValid || !customDirty) return
    void persist({ ...assistant, model: trimmedCustomModel })
  }

  return (
    <Card index={2}>
      <SectionHeader
        title="Assistant model"
        hint="Availability depends on your ChatGPT plan — an unavailable model only fails when you send a message"
        icon={<Brain size={18} weight="fill" className="text-sleep" />}
      />

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium text-ink-faint">Model</span>
        <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-white/[0.03] p-0.5">
          {ASSISTANT_MODEL_PRESETS.map((m) => (
            <Pill
              key={m.id}
              active={!custom && assistant.model === m.id}
              layoutId="assistant-model-active"
              onClick={() => {
                setCustom(false)
                selectModel(m.id)
              }}
            >
              {m.label}
            </Pill>
          ))}
          <Pill
            active={custom}
            layoutId="assistant-model-active"
            onClick={() => {
              setCustom(true)
              setCustomModel(PRESET_IDS.has(assistant.model) ? '' : assistant.model)
            }}
          >
            Custom…
          </Pill>
        </div>
        {custom && (
          <div className="flex w-full max-w-md">
            <Input
              autoFocus
              className="rounded-r-none"
              placeholder="model-id"
              spellCheck={false}
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyCustomModel()
              }}
            />
            <Button
              className="rounded-l-none border-l-0"
              disabled={!customValid || !customDirty}
              onClick={applyCustomModel}
            >
              Apply
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-medium text-ink-faint">Reasoning effort</span>
        <div className="flex w-fit rounded-xl border border-hairline bg-white/[0.03] p-0.5">
          {efforts.map((effort) => (
            <Pill
              key={effort}
              active={assistant.reasoningEffort === effort}
              layoutId="assistant-effort-active"
              onClick={() => selectEffort(effort)}
            >
              {EFFORT_LABELS[effort]}
            </Pill>
          ))}
        </div>
        <p className="text-[11px] text-ink-faint">
          Higher effort digs deeper on complex questions and takes longer to answer.
        </p>
      </div>
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
    <Card index={4}>
      <SectionHeader
        title="Daily goals"
        hint="Used for the rings and the goal lines on charts"
        icon={<Target size={18} weight="fill" className="text-recovery" />}
      />
      <div className="display-sm-four-grid gap-4">
        {field('steps', 'Steps', 'count')}
        {field('activeZoneMinutes', 'Zone minutes', 'min')}
        {field('caloriesOut', 'Calories burned', 'kcal')}
        {field('caloriesIn', 'Calories eaten', 'kcal')}
        {field('proteinG', 'Protein', 'g')}
        {field('carbsG', 'Carbs', 'g')}
        {field('fatG', 'Fat', 'g')}
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

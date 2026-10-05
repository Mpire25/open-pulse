import { DashboardEditControls, useDashboardEditor } from '@/components/DashboardEditor'
import { MenuBarSlots } from './MenuBarDashboard'
import { useCurrentDay } from '@/hooks/useCurrentDay'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { Bell, Brain, ChatCircleDots, CheckCircle, GoogleLogo, Sparkle, Target, ArrowClockwise, Trash, Warning } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { GoogleSetup } from '@/components/GoogleSetup'
import { cn } from '@/lib/utils'
import {
  ASSISTANT_MODEL_PATTERN,
  type AppSettings,
  type AssistantSettings,
  type ModelCatalog,
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
        <p className="mt-1 text-[13px] text-ink-dim">Accounts, daily goals, and app preferences.</p>
      </motion.header>

      {window.pulse.app.platform === 'darwin' && (
        <MenuBarCard
          settings={settings}
          connected={google.connected}
          onSettingsChange={onSettingsChange}
        />
      )}
      <GoogleCard
        settings={settings}
        google={google}
        onSettingsChange={onSettingsChange}
        onGoogleChange={onGoogleChange}
      />
      <CodexCard codex={codex} onCodexChange={onCodexChange} />
      <AssistantCard codex={codex} settings={settings} onSettingsChange={onSettingsChange} />
      <ResponseNotificationsCard settings={settings} onSettingsChange={onSettingsChange} />
      <ChatRetentionCard settings={settings} onSettingsChange={onSettingsChange} />
      <GoalsCard settings={settings} onSettingsChange={onSettingsChange} />
    </div>
  )
}

function ResponseNotificationsCard({ settings, onSettingsChange }: {
  settings: AppSettings
  onSettingsChange: (settings: AppSettings) => void
}): React.JSX.Element {
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const change = async (patch: Partial<AppSettings>): Promise<void> => {
    if (saving) return
    setSaving(true)
    setFailure(null)
    try {
      onSettingsChange(await window.pulse.settings.update(patch))
    } catch {
      setFailure('Could not save the notification preference. Please try again.')
    } finally {
      setSaving(false)
    }
  }
  return <Card index={3}>
    <SectionHeader title="Assistant notifications" hint="Know when your response is ready" icon={<Bell size={18} weight="fill" className="text-ink-dim" />} />
    <div className="flex items-center justify-between gap-6">
      <div>
        <label htmlFor="response-notifications-enabled" className="text-[13px] font-medium text-ink">Notify when a response finishes</label>
        <p id="response-notifications-description" className="mt-1 text-[12px] leading-relaxed text-ink-dim">When you aren’t viewing that chat, show a notification. Click it to open the response.</p>
      </div>
      <Switch id="response-notifications-enabled" checked={settings.responseNotificationsEnabled} disabled={saving} aria-describedby="response-notifications-description" onCheckedChange={(enabled) => void change({ responseNotificationsEnabled: enabled })} />
    </div>
    <div className="flex items-center justify-between gap-6">
      <div>
        <label htmlFor="response-notification-previews" className="text-[13px] font-medium text-ink">Show message previews</label>
        <p id="response-notification-previews-description" className="mt-1 text-[12px] leading-relaxed text-ink-dim">Show the chat name and a short answer preview. This may reveal health information on your desktop or lock screen. Turn off to use generic notifications.</p>
      </div>
      <Switch id="response-notification-previews" checked={settings.responseNotificationPreviews} disabled={saving || !settings.responseNotificationsEnabled} aria-describedby="response-notification-previews-description" onCheckedChange={(previews) => void change({ responseNotificationPreviews: previews })} />
    </div>
    <div className="flex items-center justify-between gap-6">
      <label htmlFor="response-notification-sound" className="text-[13px] font-medium text-ink">Play a sound</label>
      <Switch id="response-notification-sound" checked={settings.responseNotificationSound} disabled={saving || !settings.responseNotificationsEnabled} onCheckedChange={(sound) => void change({ responseNotificationSound: sound })} />
    </div>
    <p className="text-[12px] leading-relaxed text-ink-faint">OpenPulse must remain running with the chat window open or minimized. Allow notifications in your system settings; Focus settings may silence them.</p>
    {failure && <p role="alert" className="text-[12px] text-danger">{failure}</p>}
  </Card>
}

function MenuBarCard({ settings, connected, onSettingsChange }: {
  settings: AppSettings
  connected: boolean
  onSettingsChange: (settings: AppSettings) => void
}): React.JSX.Element {
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const change = async (enabled: boolean): Promise<void> => {
    if (saving) return
    setSaving(true)
    setFailure(null)
    try {
      onSettingsChange(await window.pulse.settings.update({ menuBarEnabled: enabled }))
    } catch {
      setFailure('Could not save the menu bar preference. Please try again.')
    } finally {
      setSaving(false)
    }
  }
  return <Card index={0}>
    <SectionHeader
      title="macOS menu bar"
      hint="A quick view of your daily activity, sleep and health"
      icon={
        <span aria-hidden="true" className="flex h-6 w-[18px] shrink-0 items-center justify-center text-[20px] leading-none text-ink-dim" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
          {'\uF8FF'}
        </span>
      }
    />
    <div className="flex items-center justify-between gap-6">
      <div>
        <label htmlFor="menu-bar-enabled" className="text-[13px] font-medium text-ink">Show in menu bar</label>
        <p id="menu-bar-description" className="mt-1 text-[12px] leading-relaxed text-ink-dim">Keep your daily rings and health summary a click away, even when the main window is closed.</p>
      </div>
      <Switch id="menu-bar-enabled" checked={settings.menuBarEnabled} disabled={saving} aria-describedby="menu-bar-description" onCheckedChange={(enabled) => void change(enabled)} />
    </div>
    {failure && <p role="alert" className="text-[12px] text-danger">{failure}</p>}
    <MenuBarLayoutEditor
      settings={settings}
      connected={connected}
    />
  </Card>
}

function MenuBarLayoutEditor({
  settings,
  connected
}: {
  settings: AppSettings
  connected: boolean
}): React.JSX.Element {
  const editor = useDashboardEditor('menuBar')
  const [today] = useCurrentDay()
  return (
    <div className="flex flex-col gap-4 border-t border-hairline pt-5" data-menu-bar-layout>
      <SectionHeader
        title="Layout"
        hint="Choose your rings, summaries and charts"
        action={<DashboardEditControls editor={editor} />}
      />
      {editor.isError && (
        <p role="alert" className="text-[12px] text-danger">
          Could not load your layout. <button onClick={() => void editor.refetch()}>Retry</button>
        </p>
      )}
      {editor.editing && editor.layout && (
        <>
          {!connected && (
            <p className="text-[12px] text-ink-dim">
              Connect Fitbit to see readings in the preview.
            </p>
          )}
          <div className="dashboard-menu-preview">
            <div className="menu-dashboard">
              <div className="menu-content">
                <header className="menu-header">
                  <span className="menu-brand">OpenPulse</span>
                  <span className="text-[11px] text-ink-faint">Preview</span>
                </header>
                <MenuBarSlots
                  layout={editor.layout}
                  date={today}
                  settings={settings}
                  enabled={connected}
                  editor={editor}
                  preview
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const RETENTION_OPTIONS: Array<{ value: ChatRetention; label: string; phrase: string }> = [
  { value: 'session', label: 'Until next launch', phrase: 'started before this launch' },
  { value: '24-hours', label: '24 hours', phrase: 'older than 24 hours' },
  { value: '7-days', label: '7 days', phrase: 'older than 7 days' },
  { value: '30-days', label: '30 days', phrase: 'older than 30 days' },
  { value: 'forever', label: 'Forever', phrase: '' }
]

function ChatRetentionCard({
  settings,
  onSettingsChange
}: {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
}): React.JSX.Element {
  const [pending, setPending] = useState<{ retention: ChatRetention; count: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const failureText = (error: unknown): string =>
    error instanceof Error && error.message.trim()
      ? error.message.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
      : 'Chat retention could not be changed.'

  const apply = async (retention: ChatRetention): Promise<void> => {
    setBusy(true)
    try {
      // Main clears the chats first and only then saves the policy, so a failure
      // here leaves retention exactly as it was.
      onSettingsChange(await window.pulse.chats.applyRetention(retention))
      setPending(null)
      setFailure(null)
    } catch (error) {
      setPending(null)
      setFailure(failureText(error))
    } finally {
      setBusy(false)
    }
  }

  const selectRetention = async (retention: ChatRetention): Promise<void> => {
    if (busy || retention === settings.chatRetention) return
    setBusy(true)
    setFailure(null)
    let count: number
    try {
      // The count has to come from the store: it spans every signed-in account,
      // not just the one loaded here, and it is right even mid-reload.
      count = await window.pulse.chats.retentionPreview(retention)
    } catch (error) {
      setFailure(failureText(error))
      return
    } finally {
      setBusy(false)
    }
    if (count > 0) setPending({ retention, count })
    else await apply(retention)
  }

  const pendingOption = RETENTION_OPTIONS.find((option) => option.value === pending?.retention)

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
            disabled={busy}
            onClick={() => void selectRetention(option.value)}
          >
            {option.label}
          </Pill>
        ))}
      </div>
      <p className="text-[11px] text-ink-faint">
        Pinned and kept chats are never removed. Expired chats are cleared when you change this setting and
        each time the app opens.
      </p>
      {failure && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
          <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
          {failure}
        </div>
      )}

      <Dialog.Root open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline bg-panel p-5 shadow-2xl outline-none">
            <Dialog.Title className="display text-[16px] font-semibold text-ink">
              Delete {pending?.count} {pending?.count === 1 ? 'chat' : 'chats'}?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
              Chats {pendingOption?.phrase} that aren&rsquo;t pinned or kept will be permanently deleted. This
              cannot be undone.
              <span className="mt-2 block">
                Cancel if you want to open chat history first and keep the chats that matter.
              </span>
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost" size="sm">Cancel</Button>
              </Dialog.Close>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (pending) void apply(pending.retention)
                }}
              >
                <Trash size={13} /> Delete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Card>
  )
}

function effortLabel(effort: ReasoningEffort): string {
  return effort.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function Pill({
  active,
  layoutId,
  onClick,
  disabled = false,
  children
}: {
  active: boolean
  layoutId: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative rounded-[10px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
        active ? 'text-ink' : 'text-ink-dim hover:text-ink',
        disabled && 'pointer-events-none opacity-60'
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
  codex,
  settings,
  onSettingsChange
}: {
  codex: CodexAuthStatus
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
}): React.JSX.Element {
  const [assistant, setAssistant] = useState<AssistantSettings>(settings.assistant)
  const [catalog, setCatalog] = useState<ModelCatalog>({ models: [], stale: true })
  const [loading, setLoading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const catalogSequence = useRef(0)
  const lastAuthRevision = useRef(codex.authRevision)
  const [custom, setCustom] = useState(false)
  const [customModel, setCustomModel] = useState(settings.assistant.model)
  const presets = catalog.models
  const presetIds = new Set(presets.map((m) => m.id))
  const effortsForModel = (model: string): ReasoningEffort[] => (presets.find((m) => m.id === model)?.efforts ?? []).filter((effort) => effort !== 'auto')
  const refreshModels = async (force = false): Promise<void> => {
    const sequence = ++catalogSequence.current
    setLoading(true)
    try {
      const value = await window.pulse.codex.models(force)
      if (sequence === catalogSequence.current) setCatalog(value)
    } catch (error) {
      if (sequence === catalogSequence.current) setCatalog((old) => ({ ...old, stale: true, error: error instanceof Error ? error.message : 'Could not load models.' }))
    } finally { if (sequence === catalogSequence.current) setLoading(false) }
  }
  useEffect(() => {
    setCatalog({ models: [], stale: true })
    setLoading(false)
    setCustom(false)
    const signedInAgain = lastAuthRevision.current !== codex.authRevision
    lastAuthRevision.current = codex.authRevision
    if (codex.connected) void refreshModels(signedInAgain)
    const timer = codex.connected ? setInterval(() => void refreshModels(), 6 * 60 * 60_000) : undefined
    return () => { catalogSequence.current++; if (timer) clearInterval(timer) }
  }, [codex.connected, codex.activeRegistration, codex.authRevision])
  const saveSequence = useRef(0)
  const trimmedCustomModel = customModel.trim()
  const customDirty = trimmedCustomModel !== assistant.model
  const customValid = ASSISTANT_MODEL_PATTERN.test(trimmedCustomModel)
  const efforts = effortsForModel(assistant.model)

  const persist = async (nextAssistant: AssistantSettings): Promise<void> => {
    const sequence = ++saveSequence.current
    setAssistant(nextAssistant)

    setSaveError(null)
    let next: AppSettings
    try { next = await window.pulse.settings.update({ assistant: nextAssistant }) }
    catch (error) {
      if (sequence === saveSequence.current) { setAssistant(settings.assistant); setSaveError(error instanceof Error ? error.message : 'Could not save assistant settings.') }
      return
    }
    if (sequence !== saveSequence.current) return

    onSettingsChange(next)
    setAssistant(next.assistant)
    const savedIsCustom = !presetIds.has(next.assistant.model)
    setCustom(savedIsCustom)
    setCustomModel(savedIsCustom ? next.assistant.model : '')
  }

  // Migrate legacy/default selections on catalog load. A failed save is only
  // retried after another catalog load, never in a state-update loop.
  useEffect(() => {
    if (assistant.reasoningEffort && assistant.reasoningEffort !== 'auto') return
    const effort = effortsForModel(assistant.model)[0]
    if (effort) void persist({ ...assistant, reasoningEffort: effort })
  }, [catalog])

  // Unknown capability ladders use the server default.
  const selectModel = (model: string): void => {
    const supported = effortsForModel(model)
    void persist({
      model,
      reasoningEffort: assistant.reasoningEffort && supported.includes(assistant.reasoningEffort)
        ? assistant.reasoningEffort
        : supported[0]
    })
  }

  const selectEffort = (reasoningEffort: ReasoningEffort): void => {
    void persist({ ...assistant, reasoningEffort })
  }

  const applyCustomModel = (): void => {
    if (!customValid || !customDirty) return
    selectModel(trimmedCustomModel)
  }

  if (!codex.connected || (loading && catalog.models.length === 0)) {
    return (
      <Card index={2}>
        <SectionHeader
          title="Assistant model"
          hint="Choose the model used for your insights"
          icon={<Brain size={18} weight="fill" className="text-sleep" />}
        />
        <p className="text-[12px] leading-relaxed text-ink-faint" role={codex.connected ? 'status' : undefined}>
          {codex.connected
            ? 'Loading models available through your ChatGPT plan…'
            : 'Connect your ChatGPT account above to choose a model and reasoning level.'}
        </p>
      </Card>
    )
  }

  return (
    <Card index={2}>
      <SectionHeader
        title="Assistant model"
        hint="Models available through your connected ChatGPT plan"
        icon={<Brain size={18} weight="fill" className="text-sleep" />}
      />

      {saveError && <p role="alert" className="text-[12px] text-danger">{saveError}</p>}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-ink-faint">Model</span>
          <Button size="sm" variant="ghost" disabled={loading || !codex.connected} onClick={() => void refreshModels(true)}>
            {loading ? 'Loading…' : 'Refresh models'}
          </Button>
        </div>
        {catalog.error && <p className="text-[12px] text-ink-faint">{catalog.error}{catalog.models.length > 0 ? ' Showing saved choices.' : ''}</p>}
        {!loading && !custom && !presetIds.has(assistant.model) && <p className="text-[12px] text-ink-faint">Saved selection: {assistant.model}. {catalog.stale ? 'Availability has not been checked.' : 'This model is not in the current catalog. Choose another model or use Custom.'}</p>}
        <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-white/[0.03] p-0.5">
          {presets.map((m) => (
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
              setCustomModel(presetIds.has(assistant.model) ? '' : assistant.model)
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
        {!loading && assistant.reasoningEffort && assistant.reasoningEffort !== 'auto' && !efforts.includes(assistant.reasoningEffort) && <p className="text-[12px] text-ink-faint">Saved effort: {effortLabel(assistant.reasoningEffort)}. Choose a level supported by this model.</p>}
        <span className="text-[11px] font-medium text-ink-faint">Reasoning effort</span>
        {efforts.length > 0 && <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-white/[0.03] p-0.5">
          {efforts.map((effort) => (
            <Pill
              key={effort}
              active={assistant.reasoningEffort === effort}
              layoutId="assistant-effort-active"
              onClick={() => selectEffort(effort)}
            >
              {effortLabel(effort)}
            </Pill>
          ))}
        </div>}
        <p className="text-[11px] text-ink-faint">
          {efforts.length > 0
            ? 'Higher effort digs deeper on complex questions and takes longer to answer.'
            : 'OpenAI has not provided reasoning levels for this model.'}
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
  const [operation, setOperation] = useState<'connect' | 'disconnect' | null>(null)
  const operationSequence = useRef(0)
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<void> => {
    const sequence = ++operationSequence.current
    setError(null)
    setOperation('connect')
    try {
      const status = await window.pulse.codex.connect()
      if (sequence !== operationSequence.current) return
      setOperation(null)
      onCodexChange(status)
    } catch (err) {
      if (sequence === operationSequence.current) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (sequence === operationSequence.current) setOperation(null)
    }
  }

  const disconnect = async (): Promise<void> => {
    const sequence = ++operationSequence.current
    setOperation('disconnect')
    setError(null)
    try {
      const result = await window.pulse.codex.disconnect()
      const status = await window.pulse.codex.status()
      if (sequence !== operationSequence.current) return
      setOperation(null)
      onCodexChange(status)
      setError(result.warning ?? null)
    } catch (error) {
      if (sequence === operationSequence.current) setError(error instanceof Error ? error.message : String(error))
    } finally { if (sequence === operationSequence.current) setOperation(null) }
  }

  return (
    <Card index={1}>
      <SectionHeader
        title="AI Assistant"
        hint={codex.connected ? "Your ChatGPT plan powers insights" : "Sign in with ChatGPT to power insights"}
        icon={<Sparkle size={18} weight="fill" className="text-accent" />}
        action={
          <StatusPill
            connected={codex.connected}
            text={codex.connected ? codex.planType ?? 'Connected' : 'Not connected'}
          />
        }
      />
      {codex.signedIn && !codex.planEnabled && <p className="text-[12px] text-ink-faint">ChatGPT plan usage was not authorized. Sign out and sign in again to authorize it.</p>}
      {codex.signedIn && error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
      {codex.signedIn ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-[13px] text-ink-dim">
            <CheckCircle size={16} weight="fill" className="text-[#4fd979]" />
            Signed in{codex.email ? ` as ${codex.email}` : ''}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="destructive" size="sm" disabled={operation === 'disconnect'} onClick={disconnect}>
              {operation === 'disconnect' ? 'Signing out…' : 'Sign out'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] leading-relaxed text-ink-faint">
            Connect your ChatGPT plan to OpenPulse. A browser window opens for you to authorize plan usage.
            {codex.needsReconnect && ' Your previous connection needs a one-time reconnect. Your chats and settings are preserved.'}
          </p>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <Button onClick={connect} disabled={operation !== null}>
              {operation === 'connect' ? <ArrowClockwise size={15} className="animate-spin" /> : <Sparkle size={15} weight="fill" />}
              {operation === 'connect' ? 'Waiting for ChatGPT…' : 'Sign in with ChatGPT'}
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

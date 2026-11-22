import { DashboardEditControls, useDashboardEditor } from '@/components/DashboardEditor'
import { MenuBarSlots } from './MenuBarDashboard'
import { useCurrentDay } from '@/hooks/useCurrentDay'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { Bell, Brain, ChatCircleDots, Check, CheckCircle, DownloadSimple, Minus, GoogleLogo, Sparkle, Target, ArrowClockwise, Trash, Warning } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { AppearanceCard } from '@/components/AppearanceCard'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { GoogleSetup } from '@/components/GoogleSetup'
import { cn } from '@/lib/utils'
import { shiftDate } from '@/lib/format'
import { cancelHealthExport, clearHealthExportResult, startHealthExport, useHealthExportRun } from '@/lib/health-export-run'
import {
  EXPORT_FULL_HEART_RATE_MAX_DAYS,
  EXPORT_PRESETS,
  EXPORT_SECTION_LABELS,
  EXPORT_SECTIONS,
  estimateExportBytes,
  exportOptionsProblem,
  exportRangeDays,
  formatExportBytes,
  normalizeExportSelection,
  type HealthExportOptions,
  type HealthExportPhase,
  type HealthExportProgress,
  type HealthExportSection
} from '@shared/health-export'
import { METRIC_DESCRIPTIONS } from '@shared/metric-descriptions'
import {
  ASSISTANT_MODEL_PATTERN,
  serviceTierKey,
  type AppSettings,
  type AssistantSettings,
  type ModelCatalog,
  type ChatRetention,
  type CodexAuthStatus,
  type Goals,
  type GoogleAuthStatus,
  type MetricKey,
  type ReasoningEffort,
  METRIC_KEYS
} from '@shared/types'

interface SettingsViewProps {
  settings: AppSettings
  google: GoogleAuthStatus
  codex: CodexAuthStatus
  onSettingsChange: (settings: AppSettings) => void
  onGoogleChange: (status: GoogleAuthStatus) => void
  onCodexChange: (status: CodexAuthStatus) => void
  /** Changes when File → Export Health Data asks for the export card. */
  exportFocusRequest?: number
}

export function SettingsView({
  settings,
  google,
  codex,
  onSettingsChange,
  onGoogleChange,
  onCodexChange,
  exportFocusRequest = 0
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

      <Card index={0}><AppearanceCard /></Card>
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
      <ExportCard connected={google.connected} focusRequest={exportFocusRequest} />
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
        icon={<ChatCircleDots size={18} weight="fill" className="text-accent-icon" />}
      />
      <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-surface-tint/[0.03] p-0.5">
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
          <Warning size={15} weight="fill" className="mt-0.5 shrink-0 text-danger-icon" />
          {failure}
        </div>
      )}

      <Dialog.Root open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim backdrop-blur-sm" />
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
      aria-pressed={active}
      className={cn(
        'relative rounded-[10px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
        active ? 'text-ink' : 'text-ink-dim hover:text-ink',
        disabled && 'pointer-events-none opacity-60'
      )}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-0 rounded-[10px] border border-hairline bg-surface-tint/[0.08]"
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
  const defaultEffortForModel = (model: string): ReasoningEffort | undefined => {
    const effort = presets.find((m) => m.id === model)?.defaultEffort
    return effort && effortsForModel(model).includes(effort) ? effort : undefined
  }
  const tiersForModel = (model: string) => presets.find((m) => m.id === model)?.serviceTiers ?? []
  const tierForModel = (model: string, tier?: string): string | undefined => {
    if (!tier || tier === 'default') return tier
    return tiersForModel(model).find((option) => serviceTierKey(option.id) === serviceTierKey(tier))?.id
  }
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
  const serviceTiers = tiersForModel(assistant.model)
  const selectedTier = serviceTiers.find((tier) => serviceTierKey(tier.id) === serviceTierKey(assistant.serviceTier ?? 'default'))

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
    const effort = !assistant.reasoningEffort || assistant.reasoningEffort === 'auto'
      ? defaultEffortForModel(assistant.model) : undefined
    // Only a fresh catalog can confirm that a saved tier has disappeared.
    const resetTier = !catalog.stale && assistant.serviceTier && assistant.serviceTier !== 'default'
      && !tierForModel(assistant.model, assistant.serviceTier)
    if (effort || resetTier) void persist({
      ...assistant,
      ...(effort ? { reasoningEffort: effort } : {}),
      ...(resetTier ? { serviceTier: undefined } : {})
    })
  }, [catalog])

  // Unknown capability ladders use the server default.
  const selectModel = (model: string): void => {
    const supported = effortsForModel(model)
    void persist({
      model,
      reasoningEffort: assistant.reasoningEffort && supported.includes(assistant.reasoningEffort)
        ? assistant.reasoningEffort
        : defaultEffortForModel(model),
      // As on load, only a fresh catalog can show that a model lacks the saved tier.
      serviceTier: tierForModel(model, assistant.serviceTier) ?? (catalog.stale ? assistant.serviceTier : undefined)
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
          icon={<Brain size={18} weight="fill" className="text-sleep-icon" />}
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
        icon={<Brain size={18} weight="fill" className="text-sleep-icon" />}
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
        <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-surface-tint/[0.03] p-0.5">
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

      <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
        <div className="flex min-w-0 flex-1 basis-80 flex-col gap-2">
          {!loading && assistant.reasoningEffort && assistant.reasoningEffort !== 'auto' && !efforts.includes(assistant.reasoningEffort) && <p className="text-[12px] text-ink-faint">Saved effort: {effortLabel(assistant.reasoningEffort)}. Choose a level supported by this model.</p>}
          <span className="text-[11px] font-medium text-ink-faint">Reasoning effort</span>
          {efforts.length > 0 && <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-surface-tint/[0.03] p-0.5">
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
        {serviceTiers.length > 0 && (
          <div role="group" aria-labelledby="assistant-speed-label" className="flex w-48 max-w-full flex-col gap-2">
            <span id="assistant-speed-label" className="text-[11px] font-medium text-ink-faint">Speed</span>
            <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-surface-tint/[0.03] p-0.5">
              {[{ id: 'default', label: 'Standard' }, ...serviceTiers].map((tier) => (
                <Pill
                  key={tier.id}
                  active={serviceTierKey(assistant.serviceTier ?? 'default') === serviceTierKey(tier.id)}
                  layoutId="assistant-speed-active"
                  onClick={() => void persist({ ...assistant, serviceTier: tier.id })}
                >
                  {tier.label}
                </Pill>
              ))}
            </div>
            <p className="text-[11px] text-ink-faint">
              {selectedTier?.description ?? 'Faster processing may use more of your ChatGPT allowance.'}
              {selectedTier && ' Requests may still run at Standard speed.'}
            </p>
          </div>
        )}
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
        {label} <span className="text-ink-unit">({unit})</span>
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
        icon={<Target size={18} weight="fill" className="text-recovery-icon" />}
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

const EXPORT_PHASE_LABELS: Record<HealthExportPhase, string> = {
  daily: 'Reading daily metrics…',
  sleep: 'Reading sleep…',
  workouts: 'Reading workouts…',
  nutrition: 'Reading nutrition logs…',
  body: 'Reading body measurements…',
  intraday: 'Reading heart rate and steps…',
  writing: 'Writing file…'
}

function exportProgressText(progress: HealthExportProgress | null): string {
  if (!progress) return 'Preparing…'
  const label = EXPORT_PHASE_LABELS[progress.phase]
  return progress.phase === 'intraday' && progress.total
    ? `${label} ${progress.done ?? 0} of ${progress.total} days`
    : label
}

const EXPORT_SELECTION_KEY = 'open-pulse-export-selection-v1'
const EXPORT_DOMAINS = [
  { domain: 'activity', label: 'Activity' },
  { domain: 'heart', label: 'Heart' },
  { domain: 'sleep', label: 'Sleep' },
  { domain: 'body', label: 'Body' },
  { domain: 'nutrition', label: 'Nutrition' }
] as const

interface ExportSelection {
  preset: number | 'custom'
  mode: 'everything' | 'choose'
  metrics: MetricKey[]
  sections: HealthExportSection[]
  fullHeartRate: boolean
  /** The Custom range, kept with the rest so picking Custom brings it back. */
  customStart?: string
  customEnd?: string
}

const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const DEFAULT_EXPORT_SELECTION: ExportSelection = {
  preset: 90,
  mode: 'everything',
  metrics: [],
  sections: [],
  fullHeartRate: false
}

/** The last export's choices, a per-Mac convenience; any problem falls back to the defaults. */
function readExportSelection(): ExportSelection {
  try {
    const stored = JSON.parse(window.localStorage.getItem(EXPORT_SELECTION_KEY) ?? 'null') as Partial<ExportSelection> | null
    if (!stored || typeof stored !== 'object') return DEFAULT_EXPORT_SELECTION
    const presets: Array<number | 'custom'> = [...EXPORT_PRESETS.map((entry) => entry.days), 'custom']
    return {
      preset: presets.includes(stored.preset as number | 'custom') ? (stored.preset as number | 'custom') : DEFAULT_EXPORT_SELECTION.preset,
      mode: stored.mode === 'choose' ? 'choose' : 'everything',
      ...normalizeExportSelection(stored.metrics, stored.sections),
      fullHeartRate: stored.fullHeartRate === true,
      customStart: isIsoDate(stored.customStart) ? stored.customStart : undefined,
      customEnd: isIsoDate(stored.customEnd) ? stored.customEnd : undefined
    }
  } catch {
    return DEFAULT_EXPORT_SELECTION
  }
}

function writeExportSelection(selection: ExportSelection): void {
  try {
    window.localStorage.setItem(EXPORT_SELECTION_KEY, JSON.stringify(selection))
  } catch {
    // Remembering the choice is optional.
  }
}

function ExportCheckbox({
  checked,
  indeterminate = false,
  disabled,
  onChange,
  emphasis = false,
  children
}: {
  checked: boolean
  indeterminate?: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
  emphasis?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate
  }, [indeterminate])
  const marked = checked || indeterminate
  return (
    <label className={cn('flex w-fit cursor-default items-center gap-2', emphasis ? 'text-[13px] font-medium text-ink' : 'text-[12.5px] text-ink-dim', disabled && 'opacity-60')}>
      {/* The native input keeps keyboard and screen reader behaviour; the box is drawn to match the app. */}
      <input
        ref={input}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-focus',
          marked ? 'border-accent bg-accent text-white' : 'border-ink-faint/50 bg-field'
        )}
      >
        {indeterminate ? <Minus size={10} weight="bold" /> : checked ? <Check size={10} weight="bold" /> : null}
      </span>
      {children}
    </label>
  )
}

function exportSelectionSummary(
  metrics: MetricKey[],
  sections: HealthExportSection[],
  fullHeartRate: boolean
): { headline: string; items: string } {
  const names = METRIC_KEYS.filter((metric) => metrics.includes(metric)).map((metric) => METRIC_DESCRIPTIONS[metric].label)
  const detail = EXPORT_SECTIONS.filter((section) => sections.includes(section)).map((section) => EXPORT_SECTION_LABELS[section])
  if (!names.length && !detail.length) {
    return fullHeartRate
      ? { headline: 'Full-resolution heart rate only', items: 'No daily metrics or detail sections.' }
      : { headline: 'Nothing chosen yet', items: 'Pick the metrics and detail you want in the file.' }
  }
  const metricText = names.length ? `${names.length} daily ${names.length === 1 ? 'metric' : 'metrics'}` : 'no daily metrics'
  const detailText = detail.length ? `${detail.length} detail ${detail.length === 1 ? 'section' : 'sections'}` : 'no detail'
  return { headline: `${metricText} · ${detailText}`, items: [...names, ...detail].join(', ') }
}

// The last File-menu focus request handled; the card remounts on every visit to
// Settings, and only a new request should scroll it into view.
let handledExportFocus = 0

function ExportCard({ connected, focusRequest }: { connected: boolean; focusRequest: number }): React.JSX.Element {
  const [today] = useCurrentDay()
  const [selection, setSelectionState] = useState(readExportSelection)
  const { running, progress, saved, failure } = useHealthExportRun()
  const [picking, setPicking] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusRequest <= handledExportFocus) return
    handledExportFocus = focusRequest
    anchor.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusRequest])

  const update = (patch: Partial<ExportSelection>): void => {
    setSelectionState((current) => {
      const next = { ...current, ...patch }
      writeExportSelection(next)
      return next
    })
    clearHealthExportResult()
  }
  // A remembered Custom range is kept, but never reaches past today.
  const customEnd = selection.customEnd && selection.customEnd <= today ? selection.customEnd : today
  const customStart = selection.customStart ?? shiftDate(customEnd, -29)
  const setCustomStart = (customStart: string): void => update({ customStart, customEnd })
  const setCustomEnd = (customEnd: string): void => update({ customStart, customEnd })
  const toggle = <T extends string>(list: readonly T[], keys: readonly T[], on: boolean): T[] =>
    on ? [...new Set([...list, ...keys])] : list.filter((key) => !keys.includes(key))

  const { preset } = selection
  const start = preset === 'custom' ? customStart : shiftDate(today, -(preset - 1))
  const end = preset === 'custom' ? customEnd : today
  const days = exportRangeDays(start, end)
  const fullHeartRateAvailable = days > 0 && days <= EXPORT_FULL_HEART_RATE_MAX_DAYS
  const choosing = selection.mode === 'choose'
  const options: HealthExportOptions = {
    start,
    end,
    ...normalizeExportSelection(
      choosing ? selection.metrics : METRIC_KEYS,
      choosing ? selection.sections : EXPORT_SECTIONS
    ),
    fullHeartRate: selection.fullHeartRate && fullHeartRateAvailable
  }
  const problem = exportOptionsProblem(options, today)
  const summary = exportSelectionSummary(selection.metrics, selection.sections, options.fullHeartRate)

  const run = (): void => {
    if (running || problem) return
    void startHealthExport(options)
  }
  const cancel = cancelHealthExport

  return (
    <div ref={anchor}>
      <Card index={4}>
        <SectionHeader
          title="Export data"
          hint="Save your health data as a file for ChatGPT or other tools"
          icon={<DownloadSimple size={18} weight="bold" className="text-ink-dim" />}
        />
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium text-ink-faint">Range</span>
              <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-surface-tint/[0.03] p-0.5">
                {[...EXPORT_PRESETS.map((entry) => ({ value: entry.days as number | 'custom', label: entry.label })), { value: 'custom' as const, label: 'Custom' }].map((option) => (
                  <Pill
                    key={option.value}
                    active={preset === option.value}
                    layoutId="export-range-active"
                    disabled={running}
                    onClick={() => update({ preset: option.value })}
                  >
                    {option.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-medium text-ink-faint">Include</span>
              <div className="flex w-fit flex-wrap rounded-xl border border-hairline bg-surface-tint/[0.03] p-0.5">
                <Pill active={!choosing} layoutId="export-content-active" disabled={running} onClick={() => update({ mode: 'everything' })}>
                  Everything
                </Pill>
                <Pill
                  active={choosing}
                  layoutId="export-content-active"
                  disabled={running}
                  onClick={() => {
                    update({ mode: 'choose' })
                    setPicking(true)
                  }}
                >
                  Choose…
                </Pill>
              </div>
            </div>
          </div>
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-4 sm:max-w-[360px]">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-ink-faint">From</span>
                <Input type="date" value={customStart} max={customEnd || today} disabled={running} onChange={(e) => setCustomStart(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-ink-faint">To</span>
                <Input type="date" value={customEnd} min={customStart} max={today} disabled={running} onChange={(e) => setCustomEnd(e.target.value)} />
              </label>
            </div>
          )}
        </div>
        <Dialog.Root open={picking && choosing} onOpenChange={setPicking}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim backdrop-blur-sm" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(640px,calc(100vh-48px))] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-hairline bg-panel shadow-2xl outline-none">
              <div className="px-5 pt-5">
                <Dialog.Title className="display text-[16px] font-semibold text-ink">Choose what to export</Dialog.Title>
                <Dialog.Description className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">
                  Daily metrics give one value per day. Detail adds individual records, which make the file larger.
                </Dialog.Description>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5" data-export-checklist>
                <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                  {EXPORT_DOMAINS.map(({ domain, label }) => {
                    const keys = METRIC_KEYS.filter((metric) => METRIC_DESCRIPTIONS[metric].domain === domain)
                    const picked = keys.filter((metric) => selection.metrics.includes(metric)).length
                    return (
                      <div key={domain} className="flex flex-col gap-2">
                        <ExportCheckbox
                          emphasis
                          checked={picked === keys.length}
                          indeterminate={picked > 0 && picked < keys.length}
                          disabled={running}
                          onChange={(on) => update({ metrics: toggle(selection.metrics, keys, on) })}
                        >
                          {label}
                        </ExportCheckbox>
                        <div className="flex flex-col gap-1.5 pl-[23px]">
                          {keys.map((metric) => (
                            <ExportCheckbox
                              key={metric}
                              checked={selection.metrics.includes(metric)}
                              disabled={running}
                              onChange={(on) => update({ metrics: toggle(selection.metrics, [metric], on) })}
                            >
                              {METRIC_DESCRIPTIONS[metric].label}
                            </ExportCheckbox>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex flex-col gap-2">
                    <ExportCheckbox
                      emphasis
                      checked={selection.sections.length === EXPORT_SECTIONS.length}
                      indeterminate={selection.sections.length > 0 && selection.sections.length < EXPORT_SECTIONS.length}
                      disabled={running}
                      onChange={(on) => update({ sections: toggle(selection.sections, EXPORT_SECTIONS, on) })}
                    >
                      Detail
                    </ExportCheckbox>
                    <div className="flex flex-col gap-1.5 pl-[23px]">
                      {EXPORT_SECTIONS.map((section) => (
                        <ExportCheckbox
                          key={section}
                          checked={selection.sections.includes(section)}
                          disabled={running}
                          onChange={(on) => update({ sections: toggle(selection.sections, [section], on) })}
                        >
                          {EXPORT_SECTION_LABELS[section]}
                        </ExportCheckbox>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
                <span className="text-[12px] text-ink-faint">{summary.headline}</span>
                <Dialog.Close asChild>
                  <Button size="sm">Done</Button>
                </Dialog.Close>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <div className="flex flex-col divide-y divide-hairline border-y border-hairline">
          {choosing && (
            <div className="flex items-center justify-between gap-6 py-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{summary.headline}</p>
                <p className="mt-1 truncate text-[12px] leading-relaxed text-ink-dim" title={summary.items}>
                  {summary.items || 'Pick the daily metrics and detail to include.'}
                </p>
              </div>
              <Button variant="secondary" className="shrink-0" disabled={running} onClick={() => setPicking(true)}>
                Edit selection
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-6 py-4">
          <div className="min-w-0">
            <label htmlFor="export-full-heart-rate" className="text-[13px] font-medium text-ink">Full-resolution heart rate</label>
            <p id="export-full-heart-rate-description" className="mt-1 text-[12px] leading-relaxed text-ink-dim">
              {fullHeartRateAvailable
                ? 'Every heart rate sample, not just hourly averages. Useful for looking closely at a workout or a night.'
                : `Available for ranges of ${EXPORT_FULL_HEART_RATE_MAX_DAYS} days or less.`}
            </p>
          </div>
          <Switch
            id="export-full-heart-rate"
            checked={options.fullHeartRate}
            disabled={running || !fullHeartRateAvailable}
            aria-describedby="export-full-heart-rate-description"
            onCheckedChange={(fullHeartRate) => update({ fullHeartRate })}
          />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {running ? (
              <>
                <Button variant="secondary" onClick={cancel}>Cancel</Button>
                <span role="status" className="flex items-center gap-2 text-[12px] text-ink-dim">
                  <ArrowClockwise size={13} className="animate-spin" />
                  {exportProgressText(progress)}
                </span>
              </>
            ) : (
              <>
                <Button disabled={!connected || problem != null} onClick={run}>
                  <DownloadSimple size={14} weight="bold" /> Export…
                </Button>
                <span className="text-[12px] text-ink-faint">
                  {!connected
                    ? 'Connect Google Health to export.'
                    : problem ?? `${days} ${days === 1 ? 'day' : 'days'} · about ${formatExportBytes(estimateExportBytes(options, days))}`}
                </span>
              </>
            )}
          </div>
          {saved && !running && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-dim">
              <CheckCircle size={15} weight="fill" className="text-success-icon" />
              Saved {saved.name} ({formatExportBytes(saved.bytes)})
              <Button variant="ghost" size="sm" onClick={() => void window.pulse.health.revealExport()}>Show in Finder</Button>
            </div>
          )}
          {failure && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              <Warning size={15} weight="fill" className="mt-0.5 shrink-0 text-danger-icon" />
              {failure}
            </div>
          )}
          <p className="text-[11px] text-ink-faint">
            Missing days are fetched from Google first, so long ranges with hourly or full heart rate can take a few
            minutes. The file isn&rsquo;t encrypted; keep it somewhere private.
          </p>
        </div>
      </Card>
    </div>
  )
}

function StatusPill({ connected, text }: { connected: boolean; text: string }): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        connected ? 'bg-success-fill/15 text-success' : 'bg-surface-tint/8 text-ink-dim'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-success-icon' : 'bg-ink-faint'}`} />
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
            <CheckCircle size={16} weight="fill" className="text-success-icon" />
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
        icon={<Sparkle size={18} weight="fill" className="text-accent-icon" />}
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
            <CheckCircle size={16} weight="fill" className="text-success-icon" />
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
              <Warning size={15} weight="fill" className="mt-0.5 shrink-0 text-danger-icon" />
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

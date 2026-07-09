import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkle } from '@phosphor-icons/react'
import { Sidebar, type View } from '@/components/Sidebar'
import { DateNav } from '@/components/DateNav'
import { ChatSheet } from '@/components/ChatSheet'
import { ConnectGate } from '@/components/ConnectGate'
import { HomeView } from '@/views/HomeView'
import { ActivityView } from '@/views/ActivityView'
import { HealthView } from '@/views/HealthView'
import { SleepView } from '@/views/SleepView'
import { BodyView } from '@/views/BodyView'
import { DevicesView } from '@/views/DevicesView'
import { AssistantView } from '@/views/AssistantView'
import { SettingsView } from '@/views/SettingsView'
import { useChat } from '@/hooks/useChat'
import { useHealthDay } from '@/hooks/useHealth'
import { isoToday } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppSettings, CodexAuthStatus, GoogleAuthStatus } from '@shared/types'

const DATA_VIEWS: View[] = ['home', 'activity', 'health', 'sleep', 'body']

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('home')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [google, setGoogle] = useState<GoogleAuthStatus>({ connected: false })
  const [codex, setCodex] = useState<CodexAuthStatus>({ connected: false })
  const [selectedDate, setSelectedDate] = useState(isoToday)
  const [chatOpen, setChatOpen] = useState(false)

  // One conversation shared by the Assistant page and the slide-over sheet.
  const chat = useChat()
  const { day, loading, error, refresh } = useHealthDay(selectedDate)

  useEffect(() => {
    void Promise.all([
      window.pulse.settings.get(),
      window.pulse.google.status(),
      window.pulse.codex.status()
    ]).then(([s, g, c]) => {
      setSettings(s)
      setGoogle(g)
      setCodex(c)
    })
  }, [])

  // A fresh connection invalidates whatever demo data is on screen.
  const handleGoogleChange = (status: GoogleAuthStatus): void => {
    setGoogle(status)
    refresh()
  }

  if (!settings) {
    return <div className="h-full w-full bg-canvas" />
  }

  const isDataView = DATA_VIEWS.includes(view)

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas/60 text-ink">
      <Sidebar view={view} onSelect={setView} connected={google.connected} />

      <main className="relative flex flex-1 flex-col overflow-hidden rounded-tl-[14px] border-l border-t border-hairline bg-canvas/85">
        {/* Title-bar strip: draggable, hosts the date nav and assistant toggle. */}
        <div className="drag-region relative z-30 flex h-11 shrink-0 items-center justify-between px-4">
          <div className="flex-1" />
          {isDataView && <DateNav date={selectedDate} onChange={setSelectedDate} />}
          <div className="flex flex-1 items-center justify-end">
            {view !== 'assistant' && (
              <button
                onClick={() => setChatOpen((o) => !o)}
                aria-label="Toggle assistant"
                className={cn(
                  'no-drag flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors',
                  chatOpen ? 'bg-accent-soft text-accent' : 'text-ink-dim hover:bg-white/[0.06] hover:text-ink'
                )}
              >
                <Sparkle size={14} weight="fill" />
                Ask
              </button>
            )}
          </div>
        </div>

        {/* Ambient top glow for depth without a heavy header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.025] to-transparent" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${view}-${google.connected}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              {isDataView && (
                <ConnectGate
                  connected={google.connected}
                  clientId={settings.googleClientId}
                  clientSecretConfigured={settings.googleClientSecretConfigured}
                  onConnected={handleGoogleChange}
                  onCredentialsChange={(googleClientId, googleClientSecretConfigured) =>
                    setSettings({ ...settings, googleClientId, googleClientSecretConfigured })
                  }
                >
                  {day == null ? (
                    <DaySkeleton />
                  ) : error && !day ? (
                    <ErrorState message={error} onRetry={refresh} />
                  ) : (
                    <>
                      {view === 'home' && (
                        <HomeView
                          day={day}
                          goals={settings.goals}
                          loading={loading}
                          onNavigate={(v) => setView(v)}
                        />
                      )}
                      {view === 'activity' && <ActivityView day={day} goals={settings.goals} loading={loading} />}
                      {view === 'health' && <HealthView day={day} loading={loading} />}
                      {view === 'sleep' && <SleepView day={day} goals={settings.goals} loading={loading} />}
                      {view === 'body' && <BodyView day={day} loading={loading} />}
                    </>
                  )}
                </ConnectGate>
              )}
              {view === 'devices' && <DevicesView />}
              {view === 'assistant' && (
                <AssistantView chat={chat} codex={codex} onOpenSettings={() => setView('settings')} />
              )}
              {view === 'settings' && (
                <SettingsView
                  settings={settings}
                  google={google}
                  codex={codex}
                  onSettingsChange={setSettings}
                  onGoogleChange={handleGoogleChange}
                  onCodexChange={setCodex}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <ChatSheet
          open={chatOpen && view !== 'assistant'}
          onClose={() => setChatOpen(false)}
          chat={chat}
          codexConnected={codex.connected}
          onOpenSettings={() => {
            setChatOpen(false)
            setView('settings')
          }}
        />
      </main>
    </div>
  )
}

function DaySkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-[1180px] animate-pulse flex-col gap-5 px-8 pt-2">
      <div className="h-9 w-64 rounded-lg bg-white/5" />
      <div className="h-56 rounded-[22px] bg-white/5" />
      <div className="h-44 rounded-[22px] bg-white/5" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="h-52 rounded-[22px] bg-white/5" />
        <div className="h-52 rounded-[22px] bg-white/5" />
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  return (
    <div className="grid h-full place-items-center px-8">
      <div className="max-w-sm text-center">
        <h2 className="text-[15px] font-semibold text-ink">Couldn’t load your data</h2>
        <p className="mt-2 text-[13px] text-ink-dim">{message}</p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-full bg-panel-2 px-4 py-2 text-[13px] text-ink transition-colors hover:bg-white/10"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

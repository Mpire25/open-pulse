import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar, type View } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { AssistantPanel } from '@/components/AssistantPanel'
import { ConnectGate } from '@/components/ConnectGate'
import { HomeView } from '@/views/HomeView'
import { ActivityView } from '@/views/ActivityView'
import { HeartView } from '@/views/HeartView'
import { SleepView } from '@/views/SleepView'
import { BodyView } from '@/views/BodyView'
import { NutritionView } from '@/views/NutritionView'
import { MetricDetailView } from '@/views/MetricDetailView'
import { DevicesView } from '@/views/DevicesView'
import { AssistantView } from '@/views/AssistantView'
import { SettingsView } from '@/views/SettingsView'
import { useChat } from '@/hooks/useChat'
import { isoToday } from '@/lib/format'
import type { AppSettings, CodexAuthStatus, GoogleAuthStatus, MetricKey } from '@shared/types'

const DATA_VIEWS: View[] = ['home', 'activity', 'heart', 'sleep', 'body', 'nutrition']

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('home')
  // Non-null = a metric detail page is open on top of the current data view.
  const [detailMetric, setDetailMetric] = useState<MetricKey | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [google, setGoogle] = useState<GoogleAuthStatus>({ connected: false })
  const [codex, setCodex] = useState<CodexAuthStatus>({ connected: false })
  const [selectedDate, setSelectedDate] = useState(isoToday)
  const [chatOpen, setChatOpen] = useState(false)

  // One conversation shared by the Assistant page and the side panel.
  const chat = useChat()
  const queryClient = useQueryClient()

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
    void window.pulse.health.refresh().then(() => queryClient.invalidateQueries())
  }

  const selectView = (v: View): void => {
    setView(v)
    setDetailMetric(null)
  }

  if (!settings) {
    return <div className="h-full w-full bg-canvas" />
  }

  const isDataView = DATA_VIEWS.includes(view)
  const showDetail = isDataView && detailMetric != null

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas/60 text-ink">
      <Sidebar view={view} onSelect={selectView} connected={google.connected} />

      <main className="relative flex flex-1 flex-col overflow-hidden rounded-tl-[14px] border-l border-t border-hairline bg-canvas">
        <TopBar
          showDateNav={isDataView}
          date={selectedDate}
          onDateChange={setSelectedDate}
          showAsk={view !== 'assistant'}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((o) => !o)}
        />

        <div className="flex min-h-0 flex-1">
          <div className="scroll-stable min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${view}-${detailMetric ?? 'root'}-${google.connected}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
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
                    {showDetail ? (
                      <MetricDetailView
                        metricKey={detailMetric}
                        date={selectedDate}
                        goals={settings.goals}
                        onBack={() => setDetailMetric(null)}
                      />
                    ) : (
                      <>
                        {view === 'home' && (
                          <HomeView
                            date={selectedDate}
                            goals={settings.goals}
                            onOpenMetric={setDetailMetric}
                            onNavigate={selectView}
                          />
                        )}
                        {view === 'activity' && (
                          <ActivityView date={selectedDate} goals={settings.goals} onOpenMetric={setDetailMetric} />
                        )}
                        {view === 'heart' && <HeartView date={selectedDate} onOpenMetric={setDetailMetric} />}
                        {view === 'sleep' && (
                          <SleepView date={selectedDate} goals={settings.goals} onOpenMetric={setDetailMetric} />
                        )}
                        {view === 'body' && <BodyView date={selectedDate} onOpenMetric={setDetailMetric} />}
                        {view === 'nutrition' && <NutritionView date={selectedDate} onOpenMetric={setDetailMetric} />}
                      </>
                    )}
                  </ConnectGate>
                )}
                {view === 'devices' && <DevicesView connected={google.connected} />}
                {view === 'assistant' && (
                  <AssistantView chat={chat} codex={codex} onOpenSettings={() => selectView('settings')} />
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

          <AssistantPanel
            open={chatOpen && view !== 'assistant'}
            onClose={() => setChatOpen(false)}
            chat={chat}
            codexConnected={codex.connected}
            onOpenSettings={() => {
              setChatOpen(false)
              selectView('settings')
            }}
          />
        </div>
      </main>
    </div>
  )
}

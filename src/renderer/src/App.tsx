import { useEffect, useRef, useState } from 'react'
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
import { SleepStagesDetailView } from '@/views/SleepStagesDetailView'
import { BodyView } from '@/views/BodyView'
import { NutritionView } from '@/views/NutritionView'
import { MetricDetailView } from '@/views/MetricDetailView'
import { WorkoutDetailView } from '@/views/WorkoutDetailView'
import { DevicesView } from '@/views/DevicesView'
import { AssistantView } from '@/views/AssistantView'
import { SettingsView } from '@/views/SettingsView'
import { useChat } from '@/hooks/useChat'
import { useTrackpadHistoryNavigation } from '@/hooks/useTrackpadHistoryNavigation'
import { isoToday } from '@/lib/format'
import type { MetricRange, OpenMetric } from '@/lib/metric-navigation'
import type { AppSettings, CodexAuthStatus, GoogleAuthStatus, MetricKey, Workout } from '@shared/types'

const DATA_VIEWS: View[] = ['home', 'activity', 'heart', 'sleep', 'body', 'nutrition']
const NAVIGATION_STATE_KEY = 'open-pulse-navigation-v3'

interface MetricDetailSelection {
  metric: MetricKey
  range: MetricRange
}

interface NavigationEntry {
  key: typeof NAVIGATION_STATE_KEY
  view: View
  selectedDate: string
  detailMetric: MetricDetailSelection | null
  sleepStagesOpen: boolean
  selectedWorkout: Workout | null
}

function isNavigationEntry(value: unknown): value is NavigationEntry {
  return (
    typeof value === 'object' &&
    value != null &&
    'key' in value &&
    value.key === NAVIGATION_STATE_KEY
  )
}

function sameNavigationEntry(a: NavigationEntry, b: NavigationEntry): boolean {
  return (
    a.view === b.view &&
    a.selectedDate === b.selectedDate &&
    a.detailMetric?.metric === b.detailMetric?.metric &&
    a.detailMetric?.range === b.detailMetric?.range &&
    a.sleepStagesOpen === b.sleepStagesOpen &&
    a.selectedWorkout?.id === b.selectedWorkout?.id
  )
}

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('home')
  // Non-null = a metric detail page is open on top of the current data view.
  const [detailMetric, setDetailMetric] = useState<MetricDetailSelection | null>(null)
  const [sleepStagesOpen, setSleepStagesOpen] = useState(false)
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [google, setGoogle] = useState<GoogleAuthStatus>({ connected: false })
  const [codex, setCodex] = useState<CodexAuthStatus>({ connected: false })
  const [selectedDate, setSelectedDate] = useState(isoToday)
  const [chatOpen, setChatOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const backNavigationPending = useRef(false)

  // One conversation shared by the Assistant page and the side panel.
  const chat = useChat()
  const queryClient = useQueryClient()
  useTrackpadHistoryNavigation()

  const applyNavigationEntry = (entry: NavigationEntry): void => {
    setView(entry.view)
    setSelectedDate(entry.selectedDate)
    setDetailMetric(entry.detailMetric)
    setSleepStagesOpen(entry.sleepStagesOpen)
    setSelectedWorkout(entry.selectedWorkout)
  }

  const renderedNavigationEntry = (): NavigationEntry => ({
    key: NAVIGATION_STATE_KEY,
    view,
    selectedDate,
    detailMetric,
    sleepStagesOpen,
    selectedWorkout
  })

  const currentNavigationEntry = (): NavigationEntry => {
    const historyEntry = window.history.state
    return isNavigationEntry(historyEntry) ? historyEntry : renderedNavigationEntry()
  }

  const navigate = (entry: NavigationEntry): void => {
    if (sameNavigationEntry(currentNavigationEntry(), entry)) return
    window.history.pushState(entry, '')
    applyNavigationEntry(entry)
  }

  const navigateBack = (): void => {
    if (backNavigationPending.current) return

    const historyEntry = window.history.state
    if (
      !isNavigationEntry(historyEntry) ||
      !sameNavigationEntry(historyEntry, renderedNavigationEntry())
    ) {
      return
    }

    backNavigationPending.current = true
    window.history.back()
  }

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

  useEffect(() => {
    const initialEntry: NavigationEntry = {
      key: NAVIGATION_STATE_KEY,
      view: 'home',
      selectedDate: isoToday(),
      detailMetric: null,
      sleepStagesOpen: false,
      selectedWorkout: null
    }

    if (isNavigationEntry(window.history.state)) {
      applyNavigationEntry(window.history.state)
    } else {
      window.history.replaceState(initialEntry, '')
    }

    const handleHistoryNavigation = (event: PopStateEvent): void => {
      backNavigationPending.current = false
      if (isNavigationEntry(event.state)) applyNavigationEntry(event.state)
    }

    window.addEventListener('popstate', handleHistoryNavigation)
    return () => window.removeEventListener('popstate', handleHistoryNavigation)
  }, [])

  // A fresh connection invalidates whatever demo data is on screen.
  const handleGoogleChange = (status: GoogleAuthStatus): void => {
    setGoogle(status)
    void window.pulse.health.refresh().then(() => queryClient.invalidateQueries())
  }

  const selectView = (v: View): void => {
    navigate({
      ...currentNavigationEntry(),
      view: v,
      detailMetric: null,
      sleepStagesOpen: false,
      selectedWorkout: null
    })
  }

  const selectDate = (date: string): void => {
    navigate({
      ...currentNavigationEntry(),
      selectedDate: date,
      detailMetric: null,
      sleepStagesOpen: false,
      selectedWorkout: null
    })
  }

  const openMetric: OpenMetric = (metric, initialRange) => {
    navigate({
      ...currentNavigationEntry(),
      detailMetric: { metric, range: initialRange },
      sleepStagesOpen: false,
      selectedWorkout: null
    })
  }

  const selectMetricRange = (range: MetricRange): void => {
    const entry = currentNavigationEntry()
    if (!entry.detailMetric || entry.detailMetric.range === range) return

    const nextEntry: NavigationEntry = {
      ...entry,
      detailMetric: { ...entry.detailMetric, range }
    }
    window.history.replaceState(nextEntry, '')
    applyNavigationEntry(nextEntry)
  }

  const openSleepStages = (): void => {
    navigate({
      ...currentNavigationEntry(),
      detailMetric: null,
      sleepStagesOpen: true,
      selectedWorkout: null
    })
  }

  const openWorkout = (workout: Workout): void => {
    navigate({
      ...currentNavigationEntry(),
      detailMetric: null,
      sleepStagesOpen: false,
      selectedWorkout: workout
    })
  }

  if (!settings) {
    return <div className="h-full w-full bg-canvas" />
  }

  const isDataView = DATA_VIEWS.includes(view)
  const showDetail = isDataView && detailMetric != null
  const showSleepStagesDetail = isDataView && view === 'sleep' && sleepStagesOpen
  const showWorkoutDetail = isDataView && selectedWorkout != null

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas/60 text-ink">
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <Sidebar
            view={view}
            onSelect={selectView}
            connected={google.connected}
          />
        )}
      </AnimatePresence>

      <main
        className={`relative flex flex-1 flex-col overflow-hidden border-l border-t border-hairline bg-canvas transition-[border-radius] duration-200 ${sidebarOpen ? 'rounded-tl-[14px]' : ''}`}
      >
        <TopBar
          showDateNav={isDataView}
          date={selectedDate}
          onDateChange={selectDate}
          showAsk={view !== 'assistant'}
          chatOpen={chatOpen}
          onToggleChat={() => setChatOpen((o) => !o)}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />

        <div className="flex min-h-0 flex-1">
          <div className="scroll-stable min-h-0 flex-1 overflow-y-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${view}-${detailMetric ? detailMetric.metric : sleepStagesOpen ? 'sleep-stages' : selectedWorkout?.id ?? 'root'}-${google.connected}`}
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
                    {showWorkoutDetail ? (
                      <WorkoutDetailView
                        workout={selectedWorkout}
                        date={selectedDate}
                        onBack={navigateBack}
                      />
                    ) : showSleepStagesDetail ? (
                      <SleepStagesDetailView
                        date={selectedDate}
                        onBack={navigateBack}
                      />
                    ) : showDetail ? (
                      <MetricDetailView
                        metricKey={detailMetric.metric}
                        range={detailMetric.range}
                        date={selectedDate}
                        goals={settings.goals}
                        onBack={navigateBack}
                        onRangeChange={selectMetricRange}
                      />
                    ) : (
                      <>
                        {view === 'home' && (
                          <HomeView
                            date={selectedDate}
                            goals={settings.goals}
                            onOpenMetric={openMetric}
                            onOpenWorkout={openWorkout}
                            onNavigate={selectView}
                          />
                        )}
                        {view === 'activity' && (
                          <ActivityView
                            date={selectedDate}
                            goals={settings.goals}
                            onOpenMetric={openMetric}
                            onOpenWorkout={openWorkout}
                          />
                        )}
                        {view === 'heart' && <HeartView date={selectedDate} onOpenMetric={openMetric} />}
                        {view === 'sleep' && (
                          <SleepView
                            date={selectedDate}
                            goals={settings.goals}
                            onOpenMetric={openMetric}
                            onOpenStages={openSleepStages}
                            onSelectDate={selectDate}
                          />
                        )}
                        {view === 'body' && <BodyView date={selectedDate} onOpenMetric={openMetric} />}
                        {view === 'nutrition' && (
                          <NutritionView
                            date={selectedDate}
                            goals={settings.goals}
                            onOpenMetric={openMetric}
                            onSelectDate={selectDate}
                          />
                        )}
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

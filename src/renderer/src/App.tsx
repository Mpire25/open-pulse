import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar, type View } from '@/components/Sidebar'
import { TodayView } from '@/views/TodayView'
import { TrendsView } from '@/views/TrendsView'
import { SleepView } from '@/views/SleepView'
import { AssistantView } from '@/views/AssistantView'
import { SettingsView } from '@/views/SettingsView'
import { ConnectGate } from '@/components/ConnectGate'
import type { AppSettings, CodexAuthStatus, GoogleAuthStatus } from '@shared/types'

export default function App(): React.JSX.Element {
  const [view, setView] = useState<View>('today')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [google, setGoogle] = useState<GoogleAuthStatus>({ connected: false })
  const [codex, setCodex] = useState<CodexAuthStatus>({ connected: false })

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

  if (!settings) {
    return <div className="h-full w-full bg-canvas" />
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas/60 text-ink">
      <Sidebar view={view} onSelect={setView} connected={google.connected} />

      <main className="relative flex flex-1 flex-col overflow-hidden rounded-tl-[14px] border-l border-t border-hairline bg-canvas/85">
        {/* Draggable title bar strip: lets the window be moved from the top edge,
            like any Mac app. A flex item (not an overlay) so it never covers or
            blocks interactive content below it. */}
        <div className="drag-region h-11 shrink-0" />
        {/* Ambient top glow for depth without a heavy header */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.025] to-transparent" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {/* Keying on connection state remounts the data views when Google
                connects, so their hooks refetch live data in place of demo. */}
            <motion.div
              key={`${view}-${google.connected}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="h-full"
            >
              {(view === 'today' || view === 'trends' || view === 'sleep') && (
                <ConnectGate
                  connected={google.connected}
                  clientId={settings.googleClientId}
                  clientSecretConfigured={settings.googleClientSecretConfigured}
                  onConnected={setGoogle}
                  onCredentialsChange={(googleClientId, googleClientSecretConfigured) =>
                    setSettings({ ...settings, googleClientId, googleClientSecretConfigured })
                  }
                >
                  {view === 'today' && <TodayView />}
                  {view === 'trends' && <TrendsView />}
                  {view === 'sleep' && <SleepView />}
                </ConnectGate>
              )}
              {view === 'assistant' && (
                <AssistantView codex={codex} onOpenSettings={() => setView('settings')} />
              )}
              {view === 'settings' && (
                <SettingsView
                  settings={settings}
                  google={google}
                  codex={codex}
                  onSettingsChange={setSettings}
                  onGoogleChange={setGoogle}
                  onCodexChange={setCodex}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

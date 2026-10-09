import { useEffect, useRef, useState } from 'react'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { ArrowClockwise, ArrowUpRight, GearSix, Moon, Plus } from '@phosphor-icons/react'
import type { AppSettings, GoogleAuthStatus } from '@shared/types'
import type { DashboardLayout } from '@shared/dashboard'
import type { MenuBarDestination } from '@shared/menu-bar'
import { BatteryPill } from '@/components/BatteryPill'
import {
  DashboardChart,
  DashboardRing,
  DashboardSummary,
  type DashboardOpenMetric
} from '@/components/DashboardWidgets'
import { EditableDashboardSlot, type DashboardEditorState } from '@/components/DashboardEditor'
import { useDashboardLayouts } from '@/hooks/useDashboardLayouts'
import { useDashboardWidgetPicker } from '@/hooks/useDashboardWidgetPicker'
import { useCurrentDay } from '@/hooks/useCurrentDay'
import { useDevices, useRefresh, useSyncBusy } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { isoToday } from '@/lib/format'
import './menu-bar.css'

function open(
  view: MenuBarDestination['view'],
  date = isoToday(),
  metric?: MenuBarDestination['metric'],
  range: NonNullable<MenuBarDestination['range']> = 'D'
): void {
  void window.pulse.app.open({ view, date, metric, range })
}
const healthQuery = (query: { queryKey: readonly unknown[] }): boolean =>
  ['series-metric', 'sleep-day', 'devices', 'intraday', 'activity-intraday', 'workouts'].includes(
    String(query.queryKey[0])
  )

export default function MenuBarDashboard(): React.JSX.Element {
  const client = useQueryClient()
  const busy = useSyncBusy()
  const refresh = useRefresh()
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [state, setState] = useState<{ settings: AppSettings; google: GoogleAuthStatus } | null>(
    null
  )
  const [error, setError] = useState(false)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    let previousHeight = 0
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(content.getBoundingClientRect().height)
      if (height !== previousHeight) {
        previousHeight = height
        void window.pulse.app.resizePanel(height)
      }
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    // Opening via the native tray must not restore focus to the first button.
    // Tab still moves into the controls and retains their keyboard focus rings.
    if (visible) panelRef.current?.focus({ preventScroll: true })
  }, [visible])
  useEffect(() => {
    let generation = 0
    const load = (): void => {
      const current = ++generation
      setState(null)
      setError(false)
      setRefreshFailed(false)
      client.clear()
      void Promise.all([window.pulse.settings.get(), window.pulse.google.status()])
        .then(([settings, google]) => {
          if (current === generation) setState({ settings, google })
        })
        .catch(() => {
          if (current === generation) setError(true)
        })
    }
    load()
    const account = window.pulse.chats.onAccountChanged(load)
    const auth = window.pulse.google.onStatusChanged(load)
    const visibility = window.pulse.app.onPanelVisibility((nextVisible) => {
      setVisible(nextVisible)
      // Stop scheduled retries at the visibility event, before React commits
      // the disabled widgets. A hidden renderer can defer its passive effects.
      if (!nextVisible) void client.cancelQueries({ predicate: healthQuery })
      if (nextVisible) {
        const current = generation
        // Goals may have changed in the main window while this panel was hidden.
        void window.pulse.settings
          .get()
          .then((settings) => {
            if (current === generation)
              setState((previous) => (previous ? { ...previous, settings } : previous))
          })
          .catch(() => {
            /* Keep the last known goals until the next opening. */
          })
      }
    })
    return () => {
      generation++
      account()
      auth()
      visibility()
      client.clear()
    }
  }, [client])

  return (
    <main className="menu-dashboard" data-panel-hidden={!visible || undefined} ref={panelRef} tabIndex={-1}>
      <div className="menu-content" ref={contentRef}>
        <header className="menu-header">
          <button className="menu-brand" onClick={() => open('home')} aria-label="Open OpenPulse">
            OpenPulse <ArrowUpRight size={13} />
          </button>
          <div className="menu-header-actions">
            {state?.google.connected && (
              <BatteryPill enabled={visible} onClick={() => open('devices')} />
            )}
            {state?.google.connected && (
              <button
                className="menu-icon-button"
                disabled={busy}
                aria-label="Refresh health data"
                onClick={() => {
                  setRefreshFailed(false)
                  void refresh().catch(() => setRefreshFailed(true))
                }}
              >
                <ArrowClockwise size={17} className={busy ? 'animate-spin' : ''} />
              </button>
            )}
            <button
              className="menu-icon-button"
              onClick={() => open('settings')}
              aria-label="Open settings"
            >
              <GearSix size={17} />
            </button>
          </div>
        </header>
        {state?.google.connected ? (
          <DashboardContent
            settings={state.settings}
            visible={visible}
            busy={busy}
            refreshFailed={refreshFailed}
          />
        ) : (
          <section className="menu-connect">
            <Moon size={30} />
            <h1>
              {error
                ? 'Unable to load your summary'
                : state
                  ? 'Your day, at a glance'
                  : 'Loading your summary…'}
            </h1>
            <p>
              {error
                ? 'Open OpenPulse to check your connection.'
                : state
                  ? 'Connect your Fitbit account in OpenPulse to see your daily rings and health summary here.'
                  : 'Checking your connection.'}
            </p>
            {(state || error) && (
              <button onClick={() => open('settings')}>
                Open OpenPulse <ArrowUpRight size={14} />
              </button>
            )}
          </section>
        )}
        {!state?.google.connected && <QuitButton />}
      </div>
    </main>
  )
}

function QuitButton(): React.JSX.Element {
  return (
    <button className="menu-quit" onClick={() => void window.pulse.app.quit()}>
      Quit
    </button>
  )
}

/** Also renders the draft preview in Settings, using the main window's query cache. */
export function MenuBarSlots({
  layout,
  date,
  settings,
  enabled,
  editor,
  preview = false
}: {
  layout: DashboardLayout
  date: string
  settings: AppSettings
  enabled: boolean
  editor?: DashboardEditorState
  preview?: boolean
}): React.JSX.Element {
  const onOpen: DashboardOpenMetric = (metric, range, readingDate = date) => {
    if (!preview)
      open(
        METRICS[metric].domain,
        readingDate,
        metric,
        range
      )
  }
  const wrap = (id: string, content: React.ReactNode): React.ReactNode =>
    editor ? (
      <EditableDashboardSlot key={id} id={id} editor={editor}>
        {content}
      </EditableDashboardSlot>
    ) : (
      <div key={id} className="dashboard-slot" data-dashboard-slot={id}>
        {content}
      </div>
    )
  const availableChart = ['chart1', 'chart2'].find(id => layout[id].kind === 'hidden')
  const charts = ['chart1', 'chart2'].filter(id => layout[id].kind !== 'hidden')
  return (
    <>
      <div className="menu-day">
        <h1>Today</h1>
        <span>
          {new Date(`${date}T12:00:00`).toLocaleDateString([], {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
          })}
        </span>
      </div>
      <section className="menu-rings" aria-label="Daily goal progress">
        {['ring1', 'ring2', 'ring3'].map((id) => {
          const widget = layout[id]
          return wrap(
            id,
            'metric' in widget ? (
              <DashboardRing
                metric={widget.metric}
                date={date}
                goals={settings.goals}
                enabled={enabled}
                onOpen={onOpen}
                compact
              />
            ) : null
          )
        })}
      </section>
      <section className={`menu-stats${charts.length === 0 ? ' menu-stats--no-charts' : ''}`} aria-label="Health summary">
        {['summary1', 'summary2', 'summary3', 'summary4'].map((id) => {
          const widget = layout[id]
          return wrap(
            id,
            'metric' in widget ? (
              <DashboardSummary
                metric={widget.metric}
                date={date}
                goals={settings.goals}
                enabled={enabled}
                onOpen={onOpen}
                presentation="compact"
              />
            ) : null
          )
        })}
      </section>
      {charts.map((id) =>
        wrap(
          id,
          <DashboardChart
            widget={layout[id]}
            date={date}
            goals={settings.goals}
            enabled={enabled}
            compact
            onOpen={onOpen}
            onSleep={() => {
              if (!preview) open('sleep', date)
            }}
          />
        )
      )}
      {editor?.editing && availableChart && <AddMenuBarChart id={availableChart} editor={editor} />}
    </>
  )
}

function AddMenuBarChart({ id, editor }: { id: string; editor: DashboardEditorState }): React.JSX.Element {
  const picker = useDashboardWidgetPicker(editor, id)
  return (
    <div className="pt-3">
      <button
        ref={picker.buttonRef}
        type="button"
        className="dashboard-action"
        data-menu-add-chart
        disabled={editor.saving}
        aria-haspopup="menu"
        aria-busy={picker.choosing}
        onClick={async () => {
          const widget = await picker.choose()
          if (widget) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-dashboard-slot="${id}"] > .dashboard-slot-change`)?.focus())
        }}
      >
        <Plus size={14} aria-hidden="true" />
        Add chart
      </button>
      {picker.failure && <p role="alert" className="text-[12px] text-danger">Could not open menu. Try again.</p>}
    </div>
  )
}

function DashboardContent({
  settings,
  visible,
  busy,
  refreshFailed
}: {
  settings: AppSettings
  visible: boolean
  busy: boolean
  refreshFailed: boolean
}): React.JSX.Element {
  const [today, syncToday] = useCurrentDay()
  const preferences = useDashboardLayouts()
  const devices = useDevices(visible)
  const fetching = useIsFetching({ predicate: healthQuery })
  const client = useQueryClient()
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!visible) {
      void client.cancelQueries({ predicate: healthQuery })
      return
    }
    syncToday()
    setNow(Date.now())
    const timer = window.setInterval(() => {
      setNow(Date.now())
      void client.invalidateQueries({ predicate: healthQuery })
    }, 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [client, visible, syncToday])
  useEffect(() => {
    if (visible && !busy && fetching === 0)
      setCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }, [busy, fetching, visible])
  const device = devices.data?.find((item) => item.batteryPct != null) ?? devices.data?.[0]
  const sync = device?.lastSync ? Date.parse(device.lastSync) : NaN
  const minutes = Math.max(0, Math.floor((now - sync) / 60000))
  const syncLabel = !Number.isFinite(sync)
    ? 'Device sync time unavailable'
    : minutes < 1
      ? 'Device synced just now'
      : minutes < 60
        ? `Device synced ${minutes}m ago`
        : minutes < 1440
          ? `Device synced ${Math.floor(minutes / 60)}h ago`
          : `Device synced ${Math.floor(minutes / 1440)}d ago`
  const anyError =
    refreshFailed ||
    preferences.isError ||
    client
      .getQueryCache()
      .getAll()
      .some((query) => healthQuery(query) && query.isActive() && query.state.status === 'error')
  return (
    <>
      {preferences.data ? (
        <MenuBarSlots
          layout={preferences.data.menuBar}
          date={today}
          settings={settings}
          enabled={visible}
        />
      ) : (
        <p className="menu-muted" role="status">
          {preferences.isError ? 'Could not load your layout.' : 'Loading your layout…'}
          {preferences.isError && (
            <button className="dashboard-retry" onClick={() => void preferences.refetch()}>
              Retry
            </button>
          )}
        </p>
      )}
      <footer className="menu-footer">
        <div className="menu-footer-text">
          <button
            className="menu-device-sync"
            onClick={() => open('devices', today)}
            title={device?.lastSync ?? undefined}
          >
            {devices.isPending ? 'Loading device sync…' : syncLabel}
          </button>
          <p className="menu-freshness" role="status">
            {anyError
              ? 'Some data could not be updated. Open the app for details.'
              : busy
                ? 'Checking available data…'
                : checkedAt
                  ? `Checked at ${checkedAt} · values depend on device sync`
                  : 'Showing available data'}
          </p>
        </div>
        <QuitButton />
      </footer>
    </>
  )
}

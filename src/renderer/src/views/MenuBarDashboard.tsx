import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowClockwise, ArrowUpRight, GearSix, Heartbeat, Moon, Scales } from '@phosphor-icons/react'
import type { AppSettings, GoogleAuthStatus, MetricKey } from '@shared/types'
import type { MenuBarDestination } from '@shared/menu-bar'
import { selectedSleepSession } from '@shared/sleep'
import { ColumnChart, ProgressRing } from '@/components/charts'
import { STAGE_COLOR, STAGE_LABEL } from '@/components/SleepStages'
import { useCurrentDay } from '@/hooks/useCurrentDay'
import { useDevices, useRefresh, useSeries, useSleepDay, useSyncBusy } from '@/hooks/useHealth'
import { baseline, latestPoint, rangeEnding, seriesPoints } from '@/lib/metrics'
import { formatInt, formatMinutes, isoToday, shiftDate } from '@/lib/format'
import './menu-bar.css'

const METRICS: MetricKey[] = ['steps', 'caloriesOut', 'caloriesIn', 'restingHeartRate']
const WEIGHT: MetricKey[] = ['weightKg']
const RINGS = [
  { metric: 'steps', label: 'Steps', color: 'var(--color-activity)', view: 'activity' },
  { metric: 'caloriesOut', label: 'Burned', color: 'var(--color-heart)', view: 'activity' },
  { metric: 'caloriesIn', label: 'Eaten', color: 'var(--color-recovery)', view: 'nutrition' }
] as const
const STAGES = ['AWAKE', 'REM', 'LIGHT', 'DEEP'] as const

function open(view: MenuBarDestination['view'], date = isoToday(), metric?: MenuBarDestination['metric'], range: 'D' | 'W' = 'D'): void {
  void window.pulse.app.open({ view, date, metric, range })
}

export default function MenuBarDashboard(): React.JSX.Element {
  const client = useQueryClient()
  const [state, setState] = useState<{ settings: AppSettings; google: GoogleAuthStatus } | null>(null)
  const [error, setError] = useState(false)
  const [visible, setVisible] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
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
      client.clear()
      void Promise.all([window.pulse.settings.get(), window.pulse.google.status()]).then(([settings, google]) => {
        if (current === generation) setState({ settings, google })
      }).catch(() => { if (current === generation) setError(true) })
    }
    load()
    const account = window.pulse.chats.onAccountChanged(load)
    const auth = window.pulse.google.onStatusChanged(load)
    const visibility = window.pulse.app.onPanelVisibility((nextVisible) => {
      setVisible(nextVisible)
      if (nextVisible) {
        const current = generation
        // Goals may have changed in the main window while this panel was hidden.
        void window.pulse.settings.get().then((settings) => {
          if (current === generation) setState((previous) => previous ? { ...previous, settings } : previous)
        }).catch(() => { /* Keep the last known goals until the next opening. */ })
      }
    })
    return () => { generation++; account(); auth(); visibility(); client.clear() }
  }, [client])

  return <main className="menu-dashboard" ref={panelRef} tabIndex={-1}>
    <header className="menu-header">
      <button className="menu-brand" onClick={() => open('home')} aria-label="Open OpenPulse">OpenPulse <ArrowUpRight size={13} /></button>
      <div className="menu-header-actions">
        <button className="menu-icon-button" onClick={() => open('settings')} aria-label="Open settings"><GearSix size={17} /></button>
      </div>
    </header>
    {state?.google.connected ? <DashboardContent settings={state.settings} visible={visible} /> : <section className="menu-connect">
      <Moon size={30} />
      <h1>{error ? 'Unable to load your summary' : state ? 'Your day, at a glance' : 'Loading your summary…'}</h1>
      <p>{error ? 'Open OpenPulse to check your connection.' : state ? 'Connect your Fitbit account in OpenPulse to see your daily rings and health summary here.' : 'Checking your connection.'}</p>
      {(state || error) && <button onClick={() => open('settings')}>Open OpenPulse <ArrowUpRight size={14} /></button>}
    </section>}
    <button className="menu-quit" onClick={() => void window.pulse.app.quit()}>Quit</button>
  </main>
}

function DashboardContent({ settings, visible }: { settings: AppSettings; visible: boolean }): React.JSX.Element {
  const [today, syncToday] = useCurrentDay()
  const range = rangeEnding(today, 7)
  const weightRange = rangeEnding(today, 30)
  const series = useSeries(METRICS, range.start, today, visible)
  const weightSeries = useSeries(WEIGHT, weightRange.start, today, visible)
  const sleep = useSleepDay(today, visible)
  const devices = useDevices(visible)
  const busy = useSyncBusy()
  const refresh = useRefresh()
  const client = useQueryClient()
  const [refreshFailed, setRefreshFailed] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!visible) {
      void client.cancelQueries()
      return
    }
    syncToday()
    setNow(Date.now())
    const timer = window.setInterval(() => {
      setNow(Date.now())
      void client.invalidateQueries()
    }, 5 * 60_000)
    return () => window.clearInterval(timer)
  }, [client, visible, syncToday])
  // This is deliberately a check time, not a claim that all device data is fresh.
  useEffect(() => {
    if (!busy && !series.isPending) setCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }, [busy, series.isPending])

  const values = series.data?.days[today]
  const steps = seriesPoints(series.data?.days, 'steps', range.start, today)
  const rhr = values?.restingHeartRate
  const rhrBase = baseline(seriesPoints(series.data?.days, 'restingHeartRate', range.start, today), today)
  const rhrDelta = rhr != null && rhrBase != null ? rhr - Math.round(rhrBase) : null
  const weights = seriesPoints(weightSeries.data?.days, 'weightKg', weightRange.start, today)
  const weight = latestPoint(weights)
  const recentWeights = weights.filter((p) => p.date >= shiftDate(today, -7) && p.value != null)
  const weightDelta = recentWeights.length >= 2 ? Number(((recentWeights.at(-1)!.value!) - recentWeights[0].value!).toFixed(1)) : null
  const night = selectedSleepSession(sleep.data)
  const stageTotal = STAGES.reduce((total, stage) => total + (night?.stageMinutes[stage] ?? 0), 0)
  const anyError = series.error != null || weightSeries.error != null || sleep.isError || devices.isError || refreshFailed
  const signed = (n: number): string => `${n > 0 ? '+' : ''}${n}`
  const missing = (pending: boolean): string => pending ? 'Loading…' : 'No data'

  return <>
    <div className="menu-day"><h1>Today</h1><span>{new Date(`${today}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
    <section className="menu-rings" aria-label="Daily goal progress">
      {RINGS.map(({ metric, label, color, view }) => {
        const value = values?.[metric]
        const goal = settings.goals[metric]
        const pending = series.isMetricPending(metric)
        return <button key={metric} className="menu-ring" onClick={() => open(view, today, metric)} aria-label={`${metric === 'steps' ? 'Steps' : `Calories ${label.toLowerCase()}`}: ${value == null ? missing(pending) : formatInt(value)}, goal ${formatInt(goal)}. Open details`}>
          <ProgressRing value={value ?? 0} goal={goal} color={color} size={116} stroke={10}>
            <div><strong>{value == null ? '—' : formatInt(value)}</strong><span>{label}</span></div>
          </ProgressRing>
          <small>{value == null ? missing(pending) : goal > 0 ? `${Math.round(value / goal * 100)}% of ${formatInt(goal)}` : 'No goal set'}</small>
        </button>
      })}
    </section>
    <section className="menu-stats" aria-label="Health summary">
      <button onClick={() => open('sleep', today)}>
        <span><Moon size={14} color="var(--color-sleep)" />Sleep</span>
        <strong>{sleep.data ? formatMinutes(sleep.data.minutesAsleep) : missing(sleep.isPending)}</strong>
        <small>{sleep.data && settings.goals.sleepMinutes > 0 ? `${Math.round(sleep.data.minutesAsleep / settings.goals.sleepMinutes * 100)}% of ${formatMinutes(settings.goals.sleepMinutes)}` : 'Daily total'}</small>
      </button>
      <button onClick={() => open('heart', today)}>
        <span><Heartbeat size={14} color="var(--color-heart)" />Resting HR</span>
        <strong>{rhr != null ? `${rhr} bpm` : missing(series.isMetricPending('restingHeartRate'))}</strong>
        <small>{rhrDelta === null ? 'Daily resting rate' : `${signed(rhrDelta)} vs average`}</small>
      </button>
      <button onClick={() => open('body', weight?.date ?? today, 'weightKg')}>
        <span><Scales size={14} color="var(--color-body-metric)" />Weight</span>
        <strong>{weight?.value != null ? `${weight.value.toFixed(1)} kg` : missing(weightSeries.isPending)}</strong>
        <small>{weightDelta === null ? 'Latest reading' : `${signed(weightDelta)} kg in 7 days`}</small>
        {weight && weight.date !== today && <small className="menu-reading-date">{weight.date}</small>}
      </button>
    </section>
    <section className="menu-section" aria-label="Seven-day steps chart">
      <button className="menu-section-title" onClick={() => open('activity', today, 'steps', 'W')}><h2>Steps this week</h2><span>7 days <ArrowUpRight size={12} /></span></button>
      {series.isMetricPending('steps') ? <div className="menu-chart-empty">Loading steps…</div> : steps.every((p) => p.value === null) ? <div className="menu-chart-empty">No steps recorded this week</div> : <ColumnChart
        data={steps.map((p) => ({ key: p.date, value: p.value, label: p.date, tick: new Date(`${p.date}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' }) }))}
        color="var(--color-activity)" height={105} emphasisIndex={6}
        goal={settings.goals.steps > 0 ? { value: settings.goals.steps, label: 'Goal' } : null}
        format={formatInt} unitLabel="steps" onSelect={(p) => open('activity', p.key, 'steps')}
      />}
    </section>
    <button className="menu-section menu-sleep" onClick={() => open('sleep', today)} aria-label="Open sleep stage details">
      <div className="menu-section-title"><h2>Sleep stages</h2><span>Main sleep <ArrowUpRight size={12} /></span></div>
      {stageTotal > 0 ? <>
        <div className="menu-stage-bar" aria-hidden>{STAGES.map((stage) => <span key={stage} style={{ background: STAGE_COLOR[stage], flex: night?.stageMinutes[stage] ?? 0 }} />)}</div>
        <div className="menu-stage-legend">{STAGES.map((stage) => <div key={stage}><span><i style={{ background: STAGE_COLOR[stage] }} />{STAGE_LABEL[stage]}</span><strong>{formatMinutes(night?.stageMinutes[stage] ?? 0)}</strong></div>)}</div>
      </> : <p className="menu-muted">{sleep.isPending ? 'Loading sleep stages…' : 'Sleep stages unavailable'}</p>}
    </button>
    <footer className="menu-footer">
      <div className="menu-device-list">{devices.data?.length ? devices.data.map((device, index) => {
        const sync = device.lastSync ? Date.parse(device.lastSync) : NaN
        const minutes = Math.max(0, Math.floor((now - sync) / 60000))
        const syncLabel = !Number.isFinite(sync) ? 'Sync time unavailable' : minutes < 1 ? 'Synced just now' : minutes < 60 ? `Synced ${minutes}m ago` : minutes < 1440 ? `Synced ${Math.floor(minutes / 60)}h ago` : `Synced ${Math.floor(minutes / 1440)}d ago`
        return <button key={`${device.name}-${index}`} onClick={() => open('devices', today)} title={device.lastSync ?? undefined}><strong>{device.name} · {device.batteryPct != null ? `${device.batteryPct}%` : device.batteryState ?? 'Battery unavailable'}</strong><span>{syncLabel}</span></button>
      }) : <button onClick={() => open('devices', today)}>{devices.isPending ? 'Loading device…' : 'No device information'}</button>}</div>
      <button className="menu-icon-button" disabled={busy} aria-label="Refresh health data" onClick={() => {
        setRefreshFailed(false)
        void refresh().catch(() => setRefreshFailed(true))
      }}><ArrowClockwise size={17} className={busy ? 'animate-spin' : ''} /></button>
      <p className="menu-freshness" role="status">{anyError ? 'Some data could not be updated. Open the app for details.' : busy ? 'Checking available data…' : checkedAt ? `Checked at ${checkedAt} · values depend on device sync` : 'Showing available data'}</p>
    </footer>
  </>
}

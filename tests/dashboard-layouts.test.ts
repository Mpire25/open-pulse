import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  DASHBOARD_SLOTS,
  DASHBOARD_INTRADAY_METRICS,
  DASHBOARD_TREND_PERIODS,
  normalizeDashboardLayout,
  normalizeDashboardLayouts,
  validateDashboardLayout,
  widgetOptions
} from '../src/shared/dashboard'
import { METRIC_KEYS, DEFAULT_GOALS, type MetricKey } from '../src/shared/types'
import { summaryReading } from '../src/renderer/src/lib/dashboard-widgets'
import { isMenuBarDestination } from '../src/shared/menu-bar'

describe('dashboard preferences', () => {
  test('keeps existing layouts for upgrades with no preference', () => {
    const layouts = normalizeDashboardLayouts()
    expect(layouts.home.ring2).toEqual({ kind: 'goal', metric: 'caloriesOut' })
    expect(layouts.home.chart1).toEqual({ kind: 'intraday', metric: 'steps' })
    expect(layouts.home.wide).toEqual({ kind: 'workouts' })
    expect(layouts.menuBar.chart1).toEqual({ kind: 'trend', metric: 'steps', days: 7 })
  })
  test('repairs bad entries individually and ignores unknown persisted fields', () => {
    const layout = normalizeDashboardLayout('home', {
      ring1: { kind: 'goal', metric: 'waterMl' },
      summary1: { kind: 'summary', metric: 'proteinG', unexpected: true },
      chart1: { kind: 'trend', metric: 'hrvMs', days: 30 },
      chart2: { kind: 'trend', metric: 'unknown', days: 7 },
      unknown: { kind: 'workouts' }
    })
    expect(layout.ring1).toEqual({ kind: 'goal', metric: 'steps' })
    expect(layout.summary1).toEqual({ kind: 'summary', metric: 'proteinG' })
    expect(layout.chart1).toEqual({ kind: 'trend', metric: 'hrvMs', days: 30 })
    expect(layout.chart2).toEqual({ kind: 'sleepStages' })
    expect(layout.unknown).toBeUndefined()
  })
  test('every offered widget is valid in its slot', () => {
    for (const surface of ['home', 'menuBar'] as const) {
      for (const slot of DASHBOARD_SLOTS[surface]) {
        for (const widget of widgetOptions(slot.kind, surface)) {
          const layout = { ...normalizeDashboardLayout(surface, undefined), [slot.id]: widget }
          expect(validateDashboardLayout(surface, layout)[slot.id]).toEqual(widget)
        }
      }
    }
  })
  test('refuses invalid saves without silently substituting a widget', () => {
    const layout = normalizeDashboardLayout('menuBar', undefined)
    expect(() =>
      validateDashboardLayout('menuBar', {
        ...layout,
        chart1: { kind: 'intraday', metric: 'sleepMinutes' }
      })
    ).toThrow()
    expect(() =>
      validateDashboardLayout('menuBar', {
        ...layout,
        chart1: { kind: 'trend', metric: 'hrvMs', days: 180 }
      })
    ).toThrow()
    expect(() => validateDashboardLayout('menuBar', {})).toThrow()
  })
  test('menu bar charts can be removed independently without restoring defaults on load', () => {
    const defaults = normalizeDashboardLayouts()
    for (const removed of [[], ['chart1'], ['chart2'], ['chart1', 'chart2']]) {
      const menuBar = { ...defaults.menuBar, ...Object.fromEntries(removed.map(id => [id, { kind: 'hidden', unexpected: true }])) }
      const clean = validateDashboardLayout('menuBar', menuBar)
      expect(['chart1', 'chart2'].filter(id => clean[id].kind !== 'hidden')).toHaveLength(2 - removed.length)
      for (const id of removed) expect(clean[id]).toEqual({ kind: 'hidden' })
      expect(normalizeDashboardLayouts({ version: 1, home: defaults.home, menuBar: clean }).menuBar).toEqual(clean)
      expect(clean.ring1).toEqual(defaults.menuBar.ring1)
      expect(clean.summary1).toEqual(defaults.menuBar.summary1)
    }
    for (const surface of ['home', 'menuBar'] as const) {
      for (const slot of DASHBOARD_SLOTS[surface].filter(slot => surface === 'home' || slot.kind !== 'chart')) {
        expect(() => validateDashboardLayout(surface, { ...defaults[surface], [slot.id]: { kind: 'hidden' } })).toThrow()
      }
    }
  })
  test('both surfaces offer every period and only supported one-day charts', () => {
    for (const surface of ['home', 'menuBar'] as const) {
      const options = widgetOptions('chart', surface)
      for (const metric of METRIC_KEYS) {
        expect(options.filter(widget => widget.kind === 'trend' && widget.metric === metric).map(widget => widget.kind === 'trend' && widget.days)).toEqual(DASHBOARD_TREND_PERIODS.map(period => period.days))
        expect(options.some(widget => widget.kind === 'intraday' && widget.metric === metric)).toBe((DASHBOARD_INTRADAY_METRICS as readonly string[]).includes(metric))
      }
      const layout = normalizeDashboardLayout(surface, {
        ...normalizeDashboardLayout(surface, undefined),
        chart1: { kind: 'trend', metric: 'steps', days: 365 },
        chart2: { kind: 'intraday', metric: 'restingHeartRate' }
      })
      expect(layout.chart1).toEqual({ kind: 'trend', metric: 'steps', days: 365 })
      expect(layout.chart2).toEqual({ kind: 'intraday', metric: 'restingHeartRate' })
    }
  })
  test('menu destinations cover every selectable metric and every chart period', () => {
    for (const metric of METRIC_KEYS)
      for (const range of ['D', ...DASHBOARD_TREND_PERIODS.map(period => period.range)])
        expect(isMenuBarDestination({ view: 'home', metric, range, date: '2026-10-02' })).toBe(true)
    expect(isMenuBarDestination({ view: 'settings', date: '2026-10-02' })).toBe(true)
  })
})

describe('summary dates', () => {
  const points = [
    { date: '2026-09-30', value: 80 },
    { date: '2026-10-01', value: null },
    { date: '2026-10-03', value: 75 }
  ]
  test('sparse readings never borrow future measurements', () => {
    const reading = summaryReading('weightKg', points, '2026-10-02', DEFAULT_GOALS)
    expect(reading.value).toBe(80)
    expect(reading.date).toBe('2026-09-30')
    expect(reading.sub).toContain('Last measured')
  })
  test('daily metrics never borrow a prior day or turn missing values into zero', () => {
    expect(summaryReading('steps', points, '2026-10-02', DEFAULT_GOALS).value).toBeNull()
    expect(
      summaryReading('steps', [{ date: '2026-10-02', value: 0 }], '2026-10-02', DEFAULT_GOALS).value
    ).toBe(0)
  })
})

describe('compact summary comparisons', () => {
  const date = '2026-10-02'
  const points = (base: number, value: number) => [
    ...['2026-09-29', '2026-09-30', '2026-10-01'].map(date => ({ date, value: base })),
    { date, value }
  ]
  const subtitle = (metric: MetricKey, base: number, value: number) => summaryReading(metric, points(base, value), date, DEFAULT_GOALS).compactSub

  test('configured goals take priority over comparisons for every goal metric', () => {
    for (const [metric, goal] of Object.entries(DEFAULT_GOALS)) {
      expect(subtitle(metric as MetricKey, goal * 0.5, goal * 0.63)).toBe('63% of goal')
    }
    expect(summaryReading('steps', points(10, 12), date, { ...DEFAULT_GOALS, steps: 0 }).compactSub).toBe('+20% vs avg')
  })

  test('activity and nutrition totals show the numerical difference from recent averages', () => {
    for (const metric of ['distanceKm', 'floors', 'activeMinutes', 'sedentaryMinutes', 'waterMl', 'fiberG', 'saturatedFatG', 'sodiumG', 'sugarG'] as const) {
      expect(subtitle(metric, 10, 12)).toBe('+20% vs avg')
      expect(subtitle(metric, 10, 8)).toBe('-20% vs avg')
      expect(subtitle(metric, 10, 10)).toBe('At average')
    }
    expect(subtitle('floors', 0, 2)).toBe('+2 vs avg')
    expect(subtitle('floors', 0, 0)).toBe('At average')
  })

  test('rates use absolute differences and percent readings use percentage points', () => {
    expect(subtitle('restingHeartRate', 67, 73)).toBe('+6 bpm vs avg')
    expect(subtitle('hrvMs', 50, 62)).toBe('+12 ms vs avg')
    expect(subtitle('breathingRate', 14, 14.8)).toBe('+0.8 vs avg')
    expect(subtitle('spo2Pct', 96, 95.6)).toBe('-0.4 pp vs avg')
    expect(subtitle('sleepEfficiency', 93, 95)).toBe('+2 pp vs avg')
    expect(subtitle('skinTempDeltaC', 0.2, -0.3)).toBe('vs baseline')
  })

  test('body measurements compare within the week; older measurements retain their date', () => {
    expect(subtitle('weightKg', 80, 78.5)).toBe('-1.5 kg · 7d')
    expect(subtitle('bodyFatPct', 20, 19.7)).toBe('-0.3 pp · 7d')
    expect(subtitle('bmi', 24.6, 24.4)).toBe('-0.2 · 7d')
    expect(subtitle('bmi', 24.4, 24.4)).toBe('No change · 7d')
    expect(summaryReading('weightKg', [{ date: '2026-09-24', value: 80 }, { date, value: 78.5 }], date, DEFAULT_GOALS).compactSub).toBe('No history')
    expect(summaryReading('bmi', [{ date: '2026-09-30', value: 24.4 }], date, DEFAULT_GOALS).compactSub).toBe('As of Sep 30')
  })

  test('missing readings and insufficient history never produce a fabricated comparison', () => {
    for (const metric of METRIC_KEYS) expect(summaryReading(metric, [], date, DEFAULT_GOALS).compactSub).toBe('')
    expect(summaryReading('floors', [{ date: '2026-10-01', value: 5 }, { date, value: 2 }, { date: '2026-10-03', value: 20 }], date, DEFAULT_GOALS).compactSub).toBe('No history')
    expect(summaryReading('waterMl', [{ date, value: 1000 }], date, DEFAULT_GOALS).compactSub).toBe('No history')
  })
})

test('dashboard persistence and failed-save integration without credential access', async () => {
  const child = Bun.spawn(
    [
      Bun.which('bun') ?? 'bun',
      'test',
      resolve(import.meta.dir, 'fixtures/dashboard-store-harness.ts')
    ],
    { cwd: resolve(import.meta.dir, '..'), stdout: 'pipe', stderr: 'pipe' }
  )
  const [code, out, err] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text()
  ])
  if (code !== 0) throw new Error(`Dashboard persistence failed (${code}).\n${out}\n${err}`)
}, 15_000)

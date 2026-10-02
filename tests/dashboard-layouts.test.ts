import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  DASHBOARD_SLOTS,
  normalizeDashboardLayout,
  normalizeDashboardLayouts,
  validateDashboardLayout,
  widgetOptions
} from '../src/shared/dashboard'
import { METRIC_KEYS, DEFAULT_GOALS } from '../src/shared/types'
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
        chart1: { kind: 'intraday', metric: 'steps' }
      })
    ).toThrow()
    expect(() =>
      validateDashboardLayout('menuBar', {
        ...layout,
        chart1: { kind: 'trend', metric: 'hrvMs', days: 365 }
      })
    ).toThrow()
    expect(() => validateDashboardLayout('menuBar', {})).toThrow()
  })
  test('menu destinations cover every selectable metric and monthly trends', () => {
    for (const metric of METRIC_KEYS)
      expect(isMenuBarDestination({ view: 'home', metric, range: 'M', date: '2026-10-02' })).toBe(
        true
      )
    expect(
      isMenuBarDestination({ view: 'settings', customize: 'menuBar', date: '2026-10-02' })
    ).toBe(true)
    expect(isMenuBarDestination({ view: 'home', customize: 'menuBar', date: '2026-10-02' })).toBe(
      false
    )
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

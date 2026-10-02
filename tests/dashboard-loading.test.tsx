import type { ReactNode } from 'react'
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardChart, DashboardRing, DashboardSummary } from '../src/renderer/src/components/DashboardWidgets'
import { METRICS } from '../src/renderer/src/lib/metric-registry'
import { rangeEnding } from '../src/renderer/src/lib/metrics'
import { DEFAULT_GOALS, METRIC_KEYS, type MetricKey } from '../src/shared/types'
import { DASHBOARD_INTRADAY_METRICS, normalizeDashboardLayout } from '../src/shared/dashboard'
import { MenuBarSlots } from '../src/renderer/src/views/MenuBarDashboard'

const date = '2026-10-02'
const noop = () => {}
const props = { date, goals: DEFAULT_GOALS, onOpen: noop }
const text = (html: string) => html.replace(/<[^>]*>/g, '')
const skeletonCount = (html: string) => (html.match(/animate-pulse/g) ?? []).length

function withClient(check: (render: (node: ReactNode) => string, client: QueryClient) => void): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } })
  try {
    check((node) => renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>), client)
  } finally { client.clear() }
}

function seedMetric(client: QueryClient, metric: MetricKey, value: number): void {
  const range = rangeEnding(date, METRICS[metric].aggregate === 'last' ? 30 : 7)
  client.setQueryData(['series-metric', metric, range.start, date], {
    source: 'google', start: range.start, end: date, days: { [date]: { [metric]: value } }
  })
}

describe('dashboard loading presentation', () => {
  test('every selectable hero summary uses skeletons for both value and subtitle before data arrives', () => {
    withClient((render) => {
      for (const metric of METRIC_KEYS) {
        const html = render(<DashboardSummary {...props} metric={metric} presentation="hero" />)
        expect(text(html)).toBe(METRICS[metric].shortLabel ?? METRICS[metric].label)
        expect(skeletonCount(html)).toBe(2)
      }
    })
  })

  test('resolved readings show their subtitle; selecting an uncached date restores both skeletons', () => {
    withClient((render, client) => {
      seedMetric(client, 'restingHeartRate', 73)
      seedMetric(client, 'weightKg', 77.3)
      client.setQueryData(['sleep-day', date], {
        date, sessions: [], mainSessionId: '', minutesAsleep: 512,
        minutesInSleepPeriod: 540, efficiency: 95, complete: true
      })
      for (const metric of ['sleepMinutes', 'restingHeartRate', 'weightKg'] as const) {
        const loaded = render(<DashboardSummary {...props} metric={metric} presentation="hero" />)
        expect(skeletonCount(loaded)).toBe(0)
        expect(text(loaded)).toContain(metric === 'sleepMinutes' ? '107% of goal' : 'No history')
        const nextDay = render(<DashboardSummary {...props} date="2026-10-03" metric={metric} presentation="hero" />)
        expect(text(nextDay)).toBe(METRICS[metric].shortLabel ?? METRICS[metric].label)
        expect(skeletonCount(nextDay)).toBe(2)
      }
    })
  })

  test('the homepage sleep card skeletonizes its subtitle and stage chart while loading', () => {
    withClient((render, client) => {
      const node = <DashboardChart {...props} widget={{ kind: 'sleepStages' }} onSleep={noop} />
      const pending = render(node)
      expect(text(pending)).toBe('Sleep')
      expect(pending).toContain('w-36')
      expect(pending).toContain('aria-busy="true"')
      expect(skeletonCount(pending)).toBeGreaterThan(2)
      client.setQueryData(['sleep-day', date], null)
      const empty = text(render(node))
      expect(empty).toContain('No sleep recorded')
      expect(empty).toContain('Wear your Fitbit Air to bed')
    })
  })

  test('rings, Night signals, movement charts, and workouts retain their existing skeleton states', () => {
    withClient((render) => {
      expect(skeletonCount(render(<DashboardRing {...props} metric="steps" />))).toBeGreaterThan(0)
      const signal = render(<DashboardSummary {...props} metric="hrvMs" presentation="tile" />)
      expect(text(signal)).toBe('')
      expect(signal).toContain('aria-busy="true"')
      expect(skeletonCount(signal)).toBeGreaterThan(0)
      const movement = render(<DashboardChart {...props} widget={{ kind: 'intraday', metric: 'steps' }} onSleep={noop} />)
      expect(skeletonCount(movement)).toBeGreaterThan(0)
      const workouts = render(<DashboardChart {...props} widget={{ kind: 'workouts' }} onSleep={noop} />)
      expect(text(workouts)).toBe('Workouts')
      expect(skeletonCount(workouts)).toBeGreaterThan(0)
    })
  })

  test('menu bar summaries retain their existing loading text', () => {
    withClient((render) => {
      const html = render(<DashboardSummary {...props} metric="sleepMinutes" presentation="compact" />)
      expect(text(html)).toContain('Loading…')
    })
  })

  test('hero and compact summaries share goal progress, comparisons, and weekly changes', () => {
    withClient((render, client) => {
      client.setQueryData(['sleep-day', date], { date, sessions: [], minutesAsleep: 512, efficiency: 95, complete: true })
      const examples = [
        ['restingHeartRate', 67, 73, '+6 bpm vs avg'],
        ['floors', 5, 2, '-60% vs avg'],
        ['weightKg', 78.8, 77.3, '-1.5 kg · 7d'],
        ['bmi', 24.6, 24.4, '-0.2 · 7d']
      ] as const
      for (const [metric, base, value, expected] of examples) {
        const range = rangeEnding(date, METRICS[metric].aggregate === 'last' ? 30 : 7)
        client.setQueryData(['series-metric', metric, range.start, date], {
          source: 'fixture', start: range.start, end: date,
          days: Object.fromEntries(['2026-09-29', '2026-09-30', '2026-10-01', date].map(day => [day, { [metric]: day === date ? value : base }]))
        })
        for (const presentation of ['hero', 'compact'] as const) {
          expect(text(render(<DashboardSummary {...props} metric={metric} presentation={presentation} />))).toContain(expected)
        }
      }
      for (const presentation of ['hero', 'compact'] as const) {
        expect(text(render(<DashboardSummary {...props} metric="sleepMinutes" presentation={presentation} />))).toContain('107% of goal')
      }
    })
  })

  test('hero and compact sleep efficiency use recent nights while retaining the selected night value', () => {
    withClient((render, client) => {
      client.setQueryData(['sleep-day', date], { date, sessions: [], minutesAsleep: 450, efficiency: 95, complete: true })
      const node = <DashboardSummary {...props} metric="sleepEfficiency" presentation="compact" />
      const waiting = text(render(node))
      expect(waiting).toContain('95 %')
      expect(waiting).not.toContain('No history')
      expect(waiting).not.toContain('vs avg')
      const hero = <DashboardSummary {...props} metric="sleepEfficiency" presentation="hero" />
      const waitingHero = render(hero)
      expect(text(waitingHero)).toContain('95 %')
      expect(text(waitingHero)).not.toContain('No history')
      expect(skeletonCount(waitingHero)).toBe(1)
      const range = rangeEnding(date, 7)
      client.setQueryData(['series-metric', 'sleepEfficiency', range.start, date], {
        source: 'fixture', start: range.start, end: date,
        days: {
          '2026-09-29': { sleepEfficiency: 93 },
          '2026-09-30': { sleepEfficiency: 93 },
          '2026-10-01': { sleepEfficiency: 93 },
          [date]: { sleepEfficiency: 80 }
        }
      })
      expect(text(render(node))).toContain('95 %+2 pp vs avg')
      expect(text(render(hero))).toContain('95 %+2 pp vs avg')
      expect(skeletonCount(render(hero))).toBe(0)
    })
  })

  test('long trends query the selected period and preserve chart heights on both surfaces', () => {
    withClient((render, client) => {
      for (const compact of [false, true]) {
        for (const days of [90, 365] as const) {
          const range = rangeEnding(date, days)
          const html = render(<DashboardChart {...props} compact={compact} widget={{ kind: 'trend', metric: 'steps', days }} onSleep={noop} />)
          expect(text(html)).toContain(days === 90 ? 'Last 3 months' : 'Last 1 year · weekly daily averages')
          expect(html).toContain(`height:${compact ? 105 : 170}px`)
          expect(client.getQueryCache().find({ queryKey: ['series-metric', 'steps', range.start, date], exact: true })).toBeDefined()
        }
      }
    })
  })

  test('one-day heart rate uses heart samples and retains the correct empty and loading states', () => {
    withClient((render, client) => {
      for (const compact of [false, true]) {
        const node = <DashboardChart {...props} compact={compact} widget={{ kind: 'intraday', metric: 'restingHeartRate' }} onSleep={noop} />
        const pending = render(node)
        expect(text(pending)).toContain('Heart rate')
        expect(pending).toContain(`height:${compact ? 105 : 170}px`)
        expect(skeletonCount(pending)).toBeGreaterThan(0)
        client.setQueryData(['intraday', 'heart', date], { date, heartRate: [], stepsHourly: [], currentHeartRate: null })
        expect(text(render(node))).toContain('No heart-rate samples recorded for this day.')
        client.removeQueries({ queryKey: ['intraday', 'heart', date], exact: true })
      }
      expect(client.getQueryCache().findAll({ queryKey: ['activity-intraday'] })).toHaveLength(0)
    })
  })

  test('empty one-day activity charts describe the selected metric on both surfaces', () => {
    withClient((render, client) => {
      for (const metric of DASHBOARD_INTRADAY_METRICS.filter(metric => metric !== 'restingHeartRate')) {
        for (const compact of [false, true]) {
          const node = <DashboardChart {...props} compact={compact} widget={{ kind: 'intraday', metric }} onSleep={noop} />
          expect(skeletonCount(render(node))).toBeGreaterThan(0)
          for (const points of [[], [{ minute: 0, value: null }]]) {
            client.setQueryData(metric === 'steps' ? ['intraday', 'steps', date] : ['activity-intraday', metric, date],
              metric === 'steps'
                ? { date, stepsHourly: [], heartRate: [], currentHeartRate: null }
                : { date, metric, source: 'fixture', windowMinutes: 30, points, breakdown: [] })
            const html = render(node)
            expect(text(html)).toContain(metric === 'steps'
              ? 'No movement recorded yet for this day.'
              : `No ${METRICS[metric].label.toLowerCase()} recorded for this day.`)
            expect(html).toContain(`height:${compact ? 105 : 170}px`)
            expect(skeletonCount(html)).toBe(0)
          }
          client.removeQueries({ queryKey: metric === 'steps' ? ['intraday', 'steps', date] : ['activity-intraday', metric, date], exact: true })
        }
      }
    })
  })

  test('removed menu bar charts leave no empty section or specialized chart query', () => {
    const settings = {
      menuBarEnabled: true, googleClientId: '', googleClientSecret: '', googleClientSecretConfigured: false,
      goals: DEFAULT_GOALS, assistant: { model: 'gpt-6-astra', reasoningEffort: 'medium' as const }, chatRetention: 'forever' as const
    }
    for (const removed of [[], ['chart1'], ['chart2'], ['chart1', 'chart2']]) {
      withClient((render, client) => {
        const layout = normalizeDashboardLayout('menuBar', {
          chart1: { kind: 'intraday', metric: 'restingHeartRate' },
          chart2: { kind: 'intraday', metric: 'caloriesOut' },
          ...Object.fromEntries(removed.map(id => [id, { kind: 'hidden' }]))
        })
        const html = render(<MenuBarSlots layout={layout} date={date} settings={settings} enabled preview />)
        expect((html.match(/class="menu-section dashboard-compact-chart"/g) ?? [])).toHaveLength(2 - removed.length)
        expect(client.getQueryCache().findAll({ queryKey: ['intraday', 'heart'] })).toHaveLength(removed.includes('chart1') ? 0 : 1)
        expect(client.getQueryCache().findAll({ queryKey: ['activity-intraday', 'caloriesOut'] })).toHaveLength(removed.includes('chart2') ? 0 : 1)
        for (const id of removed) expect(html).not.toContain(`data-dashboard-slot="${id}"`)
      })
    }
  })
})

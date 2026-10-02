import type { ReactNode } from 'react'
import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardChart, DashboardRing, DashboardSummary } from '../src/renderer/src/components/DashboardWidgets'
import { METRICS } from '../src/renderer/src/lib/metric-registry'
import { rangeEnding } from '../src/renderer/src/lib/metrics'
import { DEFAULT_GOALS, METRIC_KEYS, type MetricKey } from '../src/shared/types'

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
        expect(text(loaded)).toContain(metric === 'sleepMinutes' ? '% of' : metric === 'weightKg' ? '7-day change' : METRICS[metric].hint!)
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
})

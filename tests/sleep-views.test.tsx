import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SleepView } from '../src/renderer/src/views/SleepView'
import { SleepStagesDetailView } from '../src/renderer/src/views/SleepStagesDetailView'
import { HomeView } from '../src/renderer/src/views/HomeView'
import { DEFAULT_GOALS } from '../src/shared/types'
import { mapSleep } from '../src/main/sleep-detail'
import { groupSleepDays } from '../src/shared/sleep'
import { rangeEnding } from '../src/renderer/src/lib/metrics'

const date = '2026-09-14'
const main = mapSleep({ dataPointName: 'main', sleep: {
  interval: { startTime: `${date}T00:00:00Z`, endTime: `${date}T06:00:00Z` },
  summary: { minutesAsleep: '300', minutesInSleepPeriod: '360' },
  stages: [{ type: 'DEEP', startTime: `${date}T01:00:00Z`, endTime: `${date}T02:00:00Z` }]
} })!
const extra = mapSleep({ dataPointName: 'extra', sleep: {
  interval: { startTime: `${date}T14:00:00Z`, endTime: `${date}T16:00:00Z` },
  summary: { minutesAsleep: '120', minutesInSleepPeriod: '120' }, metadata: { nap: true },
  stages: [{ type: 'LIGHT', startTime: `${date}T14:00:00Z`, endTime: `${date}T16:00:00Z` }]
} })!
const noop = () => {}
function render(view: 'sleep' | 'detail' | 'home', sessions = [main, extra], sessionId?: string): string {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, staleTime: Infinity, retry: false } } })
  const days = groupSleepDays(sessions)
  const range = rangeEnding(date, 7)
  client.setQueryData(['sleep', range.start, range.end], days)
  client.setQueryData(['sleep-day', date], days[0] ?? null)
  try {
    return renderToStaticMarkup(<QueryClientProvider client={client}>
      {view === 'sleep' ? <SleepView date={date} goals={DEFAULT_GOALS} sessionId={sessionId} onSelectSession={noop} onOpenMetric={noop} onOpenStages={noop} onSelectDate={noop} /> :
       view === 'detail' ? <SleepStagesDetailView date={date} sessionId={sessionId} onSelectSession={noop} onBack={noop} /> :
       <HomeView date={date} today={date} goals={DEFAULT_GOALS} onOpenMetric={noop} onOpenWorkout={noop} onOpenWorkouts={noop} onNavigate={noop} />}
    </QueryClientProvider>)
  } finally { client.clear() }
}
const text = (html: string) => html.replace(/<[^>]*>/g, '')

describe('sleep screens', () => {
  test('single-session sleep has no selector and retains its total', () => {
    const html = render('sleep', [main])
    expect(html).not.toContain('aria-label="Sleep session"')
    expect(text(html)).toContain('5h 0m')
    expect(text(html)).not.toContain('sessions')
  })
  test('selecting another session keeps the daily total and changes its details', () => {
    const initial = render('sleep')
    const selected = render('sleep', [main, extra], 'extra')
    for (const html of [initial, selected]) {
      expect(text(html)).toContain('7h 0mtotal asleep')
      expect(text(html)).toContain('88% of 8h 0m goal · 2 sessions')
    }
    expect(text(initial)).toContain('Stages · 5h 0m')
    expect(text(initial)).toContain('In bed6h 0mEfficiency83%')
    expect(text(selected)).toContain('Stages · 2h 0m')
    expect(text(selected)).toContain('In bed2h 0mEfficiency100%')
    expect(selected).toMatch(/aria-pressed="true"[^>]*>.*?Additional sleep/)
  })
  test('Home uses the combined total and labels the main-session preview', () => {
    const html = text(render('home'))
    expect(html).toContain('7h 0m')
    expect(html).toContain('2 sessions · Main sleep shown')
  })
  test('detail pages use the chosen session and retain duration when stages are missing', () => {
    const mainDetail = text(render('detail'))
    const extraDetail = text(render('detail', [main, extra], 'extra'))
    expect(mainDetail).toContain('Deep + REM1h 0m')
    expect(extraDetail).toContain('Deep + REM0m')
    const missing = text(render('detail', [main, { ...extra, stages: [] }], 'extra'))
    expect(missing).toContain('No stages recorded for this session. 120 minutes of sleep are included in the daily total.')
  })
})

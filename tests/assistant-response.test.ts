import { describe, expect, test } from 'bun:test'
import { AssistantResponseStream, resolveAssistantResponse, ResponseProtocolError } from '../src/main/assistant-response'
import type { AgentDataset } from '../src/main/assistant-presentation'

const empty = { overviews: [], metricCards: [], comparisons: [], charts: [], sleepCards: [], nutritionCards: [], workouts: [] }
const datasets = new Map<string, AgentDataset>([['daily', {
  tool: 'query_daily_metrics',
  data: {
    source: 'live', requestedRange: { start: '2026-07-01', end: '2026-07-04' },
    days: {
      '2026-07-01': { steps: 100, sleepMinutes: 450, weightKg: 71 },
      '2026-07-02': { steps: 200, sleepMinutes: 420, weightKg: 70 },
      '2026-07-03': { steps: 0, sleepMinutes: null, weightKg: null },
      '2026-07-04': { steps: null, sleepMinutes: null, weightKg: null }
    }
  }
}]])
const comparison = {
  datasetId: 'daily', metric: 'steps', title: 'Steps',
  currentLabel: 'Current', currentStartDate: '2026-07-02', currentEndDate: '2026-07-02', currentAggregation: 'auto',
  previousLabel: 'Previous', previousStartDate: '2026-07-01', previousEndDate: '2026-07-01', previousAggregation: 'auto'
}
function marker(args: unknown): string { return `<!--openpulse:present ${JSON.stringify(args)}-->` }
function resolve(text: string, user = 'Compare my steps') { return resolveAssistantResponse(text, datasets, user) }

describe('combined assistant answers and cards', () => {
  test('streams ordinary prose but hides markup and placeholders at every chunk boundary', () => {
    for (const raw of ['Today {{openpulse:fact:0.value}} steps. ' + marker(empty), 'Today 200 steps. ' + marker(empty)]) {
      const prefix = raw.slice(0, Math.min(...[raw.indexOf('{{'), raw.indexOf('<!--')].filter((at) => at >= 0)))
      for (let split = 0; split <= raw.length; split++) {
        const stream = new AssistantResponseStream()
        const visible = stream.push(raw.slice(0, split)) + stream.push(raw.slice(split))
        expect(visible).toBe(prefix)
      }
      const stream = new AssistantResponseStream()
      expect([...raw].map((char) => stream.push(char)).join('')).toBe(prefix)
    }
    const ordinary = new AssistantResponseStream()
    expect(['A <', ' B and {', 'text}.'].map((part) => ordinary.push(part)).join('')).toBe('A < B and {text}.')
  })

  test('fills exact facts from the same metric card and permits zero', () => {
    const request = { ...empty, metricCards: [{ datasetId: 'daily', metric: 'steps', date: '2026-07-02' }] }
    const answer = resolve('Today: {{openpulse:fact:0.formattedValue}}. ' + marker(request))
    expect(answer.text).toBe('Today: 200 steps.')
    expect(answer.parts[0]).toMatchObject({ type: 'metric-card', value: 200 })
    request.metricCards[0].date = '2026-07-03'
    expect(resolve('{{openpulse:fact:0.value}} steps. ' + marker(request)).text).toBe('0 steps.')
    request.metricCards[0].date = '2026-07-04'
    expect(() => resolve('{{openpulse:fact:0.value}} steps. ' + marker(request))).toThrow(ResponseProtocolError)
    expect(resolve('No steps were recorded. ' + marker(request)).parts[0]).toMatchObject({ value: null })
  })

  test('uses validated comparison arithmetic, signed changes, positive magnitudes and units', () => {
    const request = { ...empty, comparisons: [{ ...comparison, metric: 'sleepMinutes' }] }
    const answer = resolve('{{openpulse:fact:0.current.formattedValue}} versus {{openpulse:fact:0.previous.formattedValue}}: {{openpulse:fact:0.direction}} by {{openpulse:fact:0.changeMagnitude}} minutes ({{openpulse:fact:0.absoluteChange}}). ' + marker(request))
    expect(answer.text).toBe('7h 0m versus 7h 30m: lower by 30 minutes (-30).')
    expect(answer.parts[0]).toMatchObject({ absoluteChange: -30 })
  })

  test('normalizes implicit aggregations and preserves explicit unequal totals without change judgements', () => {
    const request = { ...empty, comparisons: [{ ...comparison, currentStartDate: '2026-07-01', currentAggregation: 'total' }] }
    expect(resolve('{{openpulse:fact:0.current.value}}. ' + marker(request)).text).toBe('150.')
    const explicit = resolve('{{openpulse:fact:0.current.value}}; {{openpulse:fact:0.direction}}. ' + marker(request), 'Compare total steps')
    expect(explicit.text).toBe('300; not comparable.')
    expect(() => resolve('{{openpulse:fact:0.percentChange}}. ' + marker(request), 'Compare total steps')).toThrow(ResponseProtocolError)
  })

  test('rejects unavailable percentages for a zero baseline', () => {
    const request = { ...empty, comparisons: [{ ...comparison, previousStartDate: '2026-07-03', previousEndDate: '2026-07-03' }] }
    expect(() => resolve('{{openpulse:fact:0.percentChangeMagnitude}}%. ' + marker(request))).toThrow(ResponseProtocolError)
    expect(resolve('Compared with zero steps. ' + marker(request)).parts[0]).toMatchObject({ percentChange: null })
  })

  test('rejects unknown datasets, out-of-range dates, extra numeric fields and invalid schema', () => {
    for (const card of [
      { datasetId: 'invented', metric: 'steps', date: '2026-07-02' },
      { datasetId: 'daily', metric: 'steps', date: '2026-06-30' },
      { datasetId: 'daily', metric: 'steps', date: '2026-07-02', value: 999 },
      { datasetId: 'daily', metric: 'fake', date: '2026-07-02' }
    ]) expect(() => resolve('Steps. ' + marker({ ...empty, metricCards: [card] }))).toThrow(ResponseProtocolError)
    for (const request of [[], null, {}, { ...empty, metricCards: 'bad' }, { ...empty, unknown: [] }, empty]) {
      expect(() => resolve('Steps. ' + marker(request))).toThrow(ResponseProtocolError)
    }
  })

  test('rejects malformed, duplicated, fenced, trailing or unresolved protocol', () => {
    const valid = marker({ ...empty, comparisons: [comparison] })
    for (const raw of [
      'Answer. <!--openpulse:present {', 'Answer. ' + valid + valid, 'Answer. ' + valid + ' Extra text.',
      'Answer. ```json\n' + valid + '\n```', 'Value {{openpulse:fact:0.current.value}}.',
      'Value {{openpulse:fact:2.current.value}}. ' + valid,
      'Value {{openpulse:fact:0.constructor}}. ' + valid, 'Value {{openpulse:fact:0.current.value}. ' + valid, ''
    ]) expect(() => resolve(raw)).toThrow(ResponseProtocolError)
  })

  test('plain fallback accepts prose while forbidding cards and placeholders', () => {
    expect(resolveAssistantResponse('An ordinary answer.', datasets, '', true)).toEqual({ text: 'An ordinary answer.', parts: [] })
    expect(() => resolveAssistantResponse('Answer. ' + marker({ ...empty, comparisons: [comparison] }), datasets, '', true)).toThrow(ResponseProtocolError)
  })
})

import { describe, expect, test } from 'bun:test'
import { AssistantAnswerStream, AssistantResponseStream, createCardResolver, resolveAssistantResponse, ResponseProtocolError } from '../src/main/assistant-response'
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

  test('streams prose after leading cards with facts filled, at every chunk boundary', () => {
    const request = { ...empty, metricCards: [{ datasetId: 'daily', metric: 'steps', date: '2026-07-02' }] }
    const raw = marker(request) + '\nToday: {{openpulse:fact:0.formattedValue}}, up from yesterday.'
    for (let split = 0; split <= raw.length; split++) {
      const cards = createCardResolver(datasets, 'How many steps?')
      const stream = new AssistantAnswerStream(cards)
      expect(stream.push(raw.slice(0, split)) + stream.push(raw.slice(split))).toBe('Today: 200 steps, up from yesterday.')
      // The published answer reuses the cards whose facts were streamed.
      const shown = cards(JSON.stringify(request))
      expect(resolveAssistantResponse(raw, datasets, 'How many steps?', false, cards).parts[0]).toBe(shown[0])
    }
    const stream = new AssistantAnswerStream(createCardResolver(datasets, ''))
    expect([...raw].map((char) => stream.push(char)).join('')).toBe('Today: 200 steps, up from yesterday.')
  })

  test('streams no further than it can validate', () => {
    const invalid = marker({ ...empty, metricCards: [{ datasetId: 'invented', metric: 'steps', date: '2026-07-02' }] })
    for (const [raw, shown] of [
      [invalid + 'Steps {{openpulse:fact:0.value}} today.', 'Steps '],
      [marker({ ...empty, metricCards: [{ datasetId: 'daily', metric: 'steps', date: '2026-07-02' }] }) + 'Steps {{openpulse:fact:1.value}}.', 'Steps '],
      ['Trailing {{openpulse:fact:0.value}}. ' + invalid, 'Trailing '],
      ['Plain answer. ' + invalid, 'Plain answer. '],
      ['<!-- other -->Hidden', '']
    ]) {
      const stream = new AssistantAnswerStream(createCardResolver(datasets, ''))
      expect([...raw].map((char) => stream.push(char)).join('')).toBe(shown)
    }
    const plain = new AssistantAnswerStream(null)
    expect(plain.push(marker(empty) + 'Text {{openpulse:fact:0.value}}')).toBe('Text ')
  })

  test('accepts the comment before or after the prose, never between', () => {
    const request = { ...empty, metricCards: [{ datasetId: 'daily', metric: 'steps', date: '2026-07-02' }] }
    expect(resolve(marker(request) + ' Today {{openpulse:fact:0.value}} steps.').text).toBe('Today 200 steps.')
    expect(resolve('Today {{openpulse:fact:0.value}} steps. ' + marker(request)).text).toBe('Today 200 steps.')
    expect(resolve('Today. ' + marker(request) + ' More.')).toEqual({ text: 'Today.  More.', parts: [], droppedCards: true })
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
    expect(resolve('No steps were recorded. ' + marker(request))).toEqual({ text: 'No steps were recorded.', parts: [], droppedCards: true })
  })

  test('quotes values rounded exactly as their cards display them', () => {
    const daily = new Map<string, AgentDataset>([['d', { tool: 'query_daily_metrics', data: {
      source: 'live', requestedRange: { start: '2026-07-01', end: '2026-07-04' },
      days: {
        '2026-07-01': { steps: 8000, weightKg: 70.26, sleepMinutes: 479.6 },
        '2026-07-02': { steps: 8000, weightKg: 70.24, sleepMinutes: 420 },
        '2026-07-03': { steps: 8995, weightKg: 70.31, sleepMinutes: 420 },
        '2026-07-04': { steps: 8994, weightKg: 70.33, sleepMinutes: 420 }
      }
    } }]])
    const steps = { ...comparison, datasetId: 'd', currentStartDate: '2026-07-03', currentEndDate: '2026-07-04', currentAggregation: 'average',
      previousStartDate: '2026-07-01', previousEndDate: '2026-07-02', previousAggregation: 'average' }
    const answer = resolveAssistantResponse(marker({ ...empty, comparisons: [steps] }) +
      '{{openpulse:fact:0.current.formattedValue}} ({{openpulse:fact:0.current.value}}), up {{openpulse:fact:0.percentChangeMagnitude}}% by {{openpulse:fact:0.changeMagnitude}}.', daily, 'Compare average steps')
    // 8,994.5 average steps and a 12.43% rise: the card shows 8,995 and 12%.
    expect(answer.text).toBe('8,995 steps (8995), up 12% by 995.')
    const cards = { ...empty, metricCards: [
      { datasetId: 'd', metric: 'weightKg', date: '2026-07-01' }, { datasetId: 'd', metric: 'sleepMinutes', date: '2026-07-01' }
    ] }
    expect(resolveAssistantResponse(marker(cards) + '{{openpulse:fact:0.formattedValue}}, {{openpulse:fact:0.value}}; {{openpulse:fact:1.formattedValue}}.', daily, 'Weight and sleep').text)
      .toBe('70.3 kg, 70.3; 8h 0m.')
  })

  test('treats card types left out of the JSON as having no cards', () => {
    const answer = resolve(marker({ metricCards: [{ datasetId: 'daily', metric: 'steps', date: '2026-07-02' }] }) + 'Today {{openpulse:fact:0.value}} steps.')
    expect(answer).toMatchObject({ text: 'Today 200 steps.', parts: [{ type: 'metric-card', value: 200 }] })
    expect(answer.droppedCards).toBeUndefined()
    expect(resolve(marker({ metricCards: [], bogus: [] }) + 'Steps.')).toEqual({ text: 'Steps.', parts: [], droppedCards: true })
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

  test('never turns a skin temperature offset into a percentage', () => {
    const skin = new Map<string, AgentDataset>([['d', { tool: 'query_daily_metrics', data: {
      source: 'live', requestedRange: { start: '2026-07-01', end: '2026-07-02' },
      days: { '2026-07-01': { skinTempDeltaC: -0.5 }, '2026-07-02': { skinTempDeltaC: -0.2 } }
    } }]])
    const request = marker({ ...empty, comparisons: [{ ...comparison, datasetId: 'd', metric: 'skinTempDeltaC' }] })
    const answer = resolveAssistantResponse(request + '{{openpulse:fact:0.direction}} by {{openpulse:fact:0.changeMagnitude}} °C.', skin, 'Compare my skin temp')
    expect(answer.text).toBe('higher by 0.3 °C.')
    expect(answer.parts[0]).toMatchObject({ percentChange: null })
    expect(() => resolveAssistantResponse(request + '{{openpulse:fact:0.percentChangeMagnitude}}%.', skin, 'Compare my skin temp')).toThrow(ResponseProtocolError)
  })

  test('drops invalid cards without a correction when the prose does not reference them', () => {
    for (const card of [
      { datasetId: 'invented', metric: 'steps', date: '2026-07-02' },
      { datasetId: 'daily', metric: 'steps', date: '2026-06-30' },
      { datasetId: 'daily', metric: 'steps', date: '2026-07-02', value: 999 },
      { datasetId: 'daily', metric: 'fake', date: '2026-07-02' }
    ]) {
      expect(resolve('Steps. ' + marker({ ...empty, metricCards: [card] }))).toEqual({ text: 'Steps.', parts: [], droppedCards: true })
      expect(() => resolve('{{openpulse:fact:0.value}} steps. ' + marker({ ...empty, metricCards: [card] }))).toThrow(ResponseProtocolError)
    }
    for (const request of [[], null, {}, { ...empty, metricCards: 'bad' }, { ...empty, unknown: [] }, empty]) {
      expect(resolve('Steps. ' + marker(request))).toEqual({ text: 'Steps.', parts: [], droppedCards: true })
    }
  })

  test('keeps the prose of malformed, duplicated, fenced or trailing markup but rejects unresolved placeholders', () => {
    const valid = marker({ ...empty, comparisons: [comparison] })
    for (const [raw, text] of [
      ['Answer. <!--openpulse:present {', 'Answer.'], ['Answer. ' + valid + valid, 'Answer.'],
      ['Answer. ' + valid + ' Extra text.', 'Answer.  Extra text.'], ['Answer. ```json\n' + valid + '\n```', 'Answer.']
    ]) expect(resolve(raw)).toEqual({ text, parts: [], droppedCards: true })
    for (const raw of [
      'Value {{openpulse:fact:0.current.value}}.',
      'Value {{openpulse:fact:2.current.value}}. ' + valid,
      'Value {{openpulse:fact:0.constructor}}. ' + valid, 'Value {{openpulse:fact:0.current.value}. ' + valid,
      'Answer. ' + valid + valid + ' {{openpulse:fact:0.current.value}}', ''
    ]) expect(() => resolve(raw)).toThrow(ResponseProtocolError)
  })

  test('plain fallback accepts prose while forbidding cards and placeholders', () => {
    expect(resolveAssistantResponse('An ordinary answer.', datasets, '', true)).toEqual({ text: 'An ordinary answer.', parts: [] })
    expect(resolveAssistantResponse('Answer. ' + marker({ ...empty, comparisons: [comparison] }), datasets, '', true))
      .toEqual({ text: 'Answer.', parts: [], droppedCards: true })
    expect(() => resolveAssistantResponse('Value {{openpulse:fact:0.current.value}}. ' + marker({ ...empty, comparisons: [comparison] }), datasets, '', true))
      .toThrow(ResponseProtocolError)
  })
})

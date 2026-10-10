// Isolated process: the real run loop, with synthetic health data and no credentials.
import { afterEach, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import type { WebContents } from 'electron'
import type { AiEvent } from '../../src/shared/types'
import { createHealthFixture, dateAgo } from '../../evals/fixture'
import { StreamTimeoutError } from '../../src/main/stream-timeout'

mock.module('electron', () => ({}))
mock.module('../../src/main/codex-auth', () => ({
  getCodexAuthGeneration: () => 1, isCodexAuthGenerationCurrent: () => true,
  getCodexTokens: async () => ({ accessToken: 'synthetic-offline', expiresAt: Date.now() + 60_000 })
}))
mock.module('../../src/main/store', () => ({ getSettings: () => ({ assistant: { model: 'offline', reasoningEffort: 'low' } }) }))
mock.module('../../src/main/health-service', () => createHealthFixture(() => {}))
mock.module('../../src/main/metric-store', () => ({ archivedMetricCoverage: () => ({}) }))
const data = {
  source: 'live', requestedRange: { start: dateAgo(1), end: dateAgo(0) },
  days: { [dateAgo(1)]: { steps: 100 }, [dateAgo(0)]: { steps: 200 } }
}
mock.module('../../src/main/health-agent-table', () => ({ buildHealthTable: async () => ({
  start: dateAgo(1), text: '<OPENPULSE_HEALTH_DATA>synthetic</OPENPULSE_HEALTH_DATA>',
  datasets: new Map([['health-table', { tool: 'query_daily_metrics', data }]])
}) }))
const { runChat, cancelChat } = await import('../../src/main/codex-chat')
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const empty = { overviews: [], metricCards: [], comparisons: [], charts: [], sleepCards: [], nutritionCards: [], workouts: [] }
const comparison = { ...empty, comparisons: [{
  datasetId: 'health-table', metric: 'steps', title: 'Steps',
  currentLabel: 'Today', currentStartDate: dateAgo(0), currentEndDate: dateAgo(0), currentAggregation: 'value',
  previousLabel: 'Yesterday', previousStartDate: dateAgo(1), previousEndDate: dateAgo(1), previousAggregation: 'value'
}] }
const card = { ...empty, metricCards: [{ datasetId: 'health-table', metric: 'steps', date: dateAgo(0) }] }
const marker = (args: unknown): string => `<!--openpulse:present ${JSON.stringify(args)}-->`
const good = 'Today {{openpulse:fact:0.current.formattedValue}} versus {{openpulse:fact:0.previous.formattedValue}}. ' + marker(comparison)

function response(text: string, annotations: unknown[] = []): Response {
  return eventsResponse([
    ...[...text].map((delta) => ({ type: 'response.output_text.delta', delta })),
    { type: 'response.output_item.done', item: { type: 'message', content: [{ type: 'output_text', text, annotations }] } },
  ])
}
function eventsResponse(events: unknown[]): Response {
  return new Response([...events, { type: 'response.completed', response: { status: 'completed' } }]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', {
      headers: { 'content-type': 'text/event-stream' }
    })
}
class Sender extends EventEmitter {
  id = Math.random()
  events: AiEvent[] = []
  isDestroyed(): boolean { return false }
  send(_channel: string, event: AiEvent): void { this.events.push(event) }
}
async function run(answers: string[], query = 'Compare today with yesterday') {
  const sender = new Sender()
  const bodies: Record<string, unknown>[] = []
  const previews: unknown[] = []
  globalThis.fetch = (async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)))
    return response(answers[Math.min(bodies.length - 1, answers.length - 1)])
  }) as typeof fetch
  await runChat(sender as unknown as WebContents, 'chat', 'run', [{ role: 'user', text: query }], (_event, answer) => {
    if (answer) previews.push(answer)
  })
  return { sender, bodies, previews, done: sender.events.find((event) => event.type === 'done') }
}
function displayed(events: AiEvent[]): string {
  let text = ''
  for (const event of events) {
    if (event.type === 'delta') text += event.text
    if (event.type === 'replace' || event.type === 'done') text = event.text
    expect(text).not.toContain('openpulse:')
    expect(text).not.toContain('<!--')
    expect(text).not.toContain('{{')
  }
  return text
}

test('one request resolves a metric card and exposes only rendered prose to the title callback', async () => {
  const result = await run(['Today {{openpulse:fact:0.formattedValue}}. ' + marker(card)], 'How many steps today?')
  expect(result.bodies).toHaveLength(1)
  expect(JSON.stringify(result.bodies[0].tools)).not.toContain('present_health_data')
  expect(result.done).toMatchObject({ text: 'Today 200 steps.', parts: [{ type: 'metric-card', value: 200 }] })
  expect(result.previews).toEqual([{ query: 'How many steps today?', text: 'Today 200 steps.' }])
  expect(displayed(result.sender.events)).toBe('Today 200 steps.')
})

test('validation retry replaces rejected prose without losing earlier progress', async () => {
  const result = await run(['Incorrect first attempt {{openpulse:fact:0.current.value}}.', good])
  expect(result.bodies).toHaveLength(2)
  expect(result.sender.events.filter((event) => event.type === 'replace')[0]).toMatchObject({ text: '' })
  expect(result.done).toMatchObject({ text: 'Today 200 steps versus 100 steps.', parts: [{ type: 'comparison', percentChange: 100 }] })
  expect(displayed(result.sender.events)).toBe('Today 200 steps versus 100 steps.')
})

test('two rejected attempts fall back to a plain answer within three requests', async () => {
  const result = await run(['Bad {{openpulse:fact:0.value}}.', 'Still bad <!--openpulse:present {', 'Today you recorded 200 steps.'])
  expect(result.bodies).toHaveLength(3)
  expect(result.bodies[2].tool_choice).toBe('none')
  expect(String(result.bodies[2].instructions)).not.toContain('Presentation JSON schema')
  expect(result.done).toMatchObject({ text: 'Today you recorded 200 steps.', parts: [] })
  expect(displayed(result.sender.events)).toBe('Today you recorded 200 steps.')
})

test('repeated invalid output stops within three requests without fabricated cards', async () => {
  const result = await run(['Bad {{openpulse:fact:0.value}}.'])
  expect(result.bodies).toHaveLength(3)
  expect(result.done).toBeUndefined()
  expect(result.sender.events.at(-1)).toMatchObject({ type: 'error', message: 'I couldn’t finish this answer. Please try again.' })
  expect(displayed(result.sender.events)).toBe('')
})

test('citations survive template substitution without corrupting the presentation JSON', async () => {
  const sender = new Sender()
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    return response(good, [{ type: 'url_citation', start_index: 0, end_index: good.length, url: 'https://example.com/source', title: 'Evidence' }])
  }) as typeof fetch
  await runChat(sender as unknown as WebContents, 'citation-chat', 'citation-run', [{ role: 'user', text: 'Compare steps' }])
  expect(requests).toBe(1)
  const done = sender.events.find((event) => event.type === 'done')
  expect(done).toMatchObject({ parts: [{ type: 'comparison' }] })
  expect(done?.type === 'done' && done.text).toContain('[1 · Evidence](https://example.com/source)')
  displayed(sender.events)
})

test('health tools remain available for history beyond the initial snapshot', async () => {
  const sender = new Sender()
  let requests = 0
  globalThis.fetch = (async () => {
    if (++requests === 1) return eventsResponse([{
      type: 'response.output_item.done', item: {
        type: 'function_call', name: 'query_daily_metrics', call_id: 'old-data',
        arguments: JSON.stringify({ metrics: ['steps'], startDate: dateAgo(200), endDate: dateAgo(199) })
      }
    }])
    return response('Older records. ' + marker({ ...empty, metricCards: [{ datasetId: 'old-data', metric: 'steps', date: dateAgo(200) }] }))
  }) as typeof fetch
  await runChat(sender as unknown as WebContents, 'old-chat', 'old-run', [{ role: 'user', text: 'Steps 200 days ago?' }])
  expect(requests).toBe(2)
  expect(sender.events.find((event) => event.type === 'done')).toMatchObject({ parts: [{ type: 'metric-card', date: dateAgo(200) }] })
  displayed(sender.events)
})

test('a long investigation can repair its final answer after several health turns', async () => {
  const sender = new Sender()
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    if (requests <= 3) return eventsResponse([
      { type: 'response.output_text.delta', delta: `Checked period ${requests}.` },
      { type: 'response.output_item.done', item: {
        type: 'function_call', name: 'query_daily_metrics', call_id: `period-${requests}`,
        arguments: JSON.stringify({ metrics: ['steps'], startDate: dateAgo(200 + requests), endDate: dateAgo(200 + requests) })
      } }
    ])
    return response(requests === 4 ? 'Rejected final attempt {{openpulse:fact:0.value}}.' : good)
  }) as typeof fetch
  await runChat(sender as unknown as WebContents, 'long-chat', 'long-run', [{ role: 'user', text: 'Investigate my history and compare steps' }])
  expect(requests).toBe(5)
  const text = displayed(sender.events)
  expect(text).toContain('Checked period 1.\n\nChecked period 2.\n\nChecked period 3.')
  expect(text).toContain('Today 200 steps versus 100 steps.')
  expect(text).not.toContain('Rejected final attempt')
})

for (const interruption of ['stop', 'timeout'] as const) {
  test(`${interruption} during a split placeholder preserves only a safe prefix`, async () => {
    const sender = new Sender()
    const encoder = new TextEncoder()
    globalThis.fetch = (async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'response.output_text.delta', delta: 'Safe prefix {{openpulse:fact:0.current.value' }) + '\n\n'))
      },
      pull(controller) {
        if (interruption === 'stop') {
          cancelChat(sender as unknown as WebContents, 'stop-chat', 'stop-run')
          controller.error(new Error('Aborted stream'))
        } else controller.error(new StreamTimeoutError('idle', 'Synthetic timeout.'))
      }
    }), { headers: { 'content-type': 'text/event-stream' } })) as typeof fetch
    await runChat(sender as unknown as WebContents, 'stop-chat', 'stop-run', [{ role: 'user', text: 'Compare steps' }])
    expect(sender.events.at(-1)).toMatchObject({ type: 'interrupted' })
    expect(displayed(sender.events)).toBe('Safe prefix ')
  })
}

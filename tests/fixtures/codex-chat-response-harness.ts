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
function messageEvents(text: string, index: number, channel?: string, annotations: unknown[] = []): unknown[] {
  const identity = channel ? { output_index: index, item_id: `message-${index}` } : {}
  const item = { type: 'message', ...(channel ? { id: `message-${index}`, channel } : {}) }
  return [
    ...(channel ? [{ type: 'response.output_item.added', ...identity, item }] : []),
    ...[...text].map((delta) => ({ type: 'response.output_text.delta', ...identity, delta })),
    { type: 'response.output_item.done', ...identity, item: { ...item, content: [{ type: 'output_text', text, annotations }] } }
  ]
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

test('leading cards fill the streamed prose and arrive with the completed answer', async () => {
  const result = await run([marker(card) + 'Today {{openpulse:fact:0.formattedValue}} so far.'], 'How many steps today?')
  expect(result.bodies).toHaveLength(1)
  const deltas = result.sender.events.flatMap((event) => event.type === 'delta' ? [event.text] : [])
  // Facts stream in place, without waiting for the end of the response.
  expect(deltas.join('')).toBe('Today 200 steps so far.')
  expect(result.done).toMatchObject({ text: 'Today 200 steps so far.', parts: [{ type: 'metric-card', value: 200 }] })
  expect(displayed(result.sender.events)).toBe('Today 200 steps so far.')
  expect(String(result.bodies[0].instructions)).toContain('begin the final answer with exactly one hidden comment')
})

for (const usesFacts of [true, false]) {
  for (const hasMessageIdentity of [true, false]) {
    test(`commentary preserves leading cards ${usesFacts ? 'with' : 'without'} facts ${hasMessageIdentity ? 'with' : 'without'} message metadata`, async () => {
      const sender = new Sender()
      const previews: unknown[] = []
      let requests = 0
      const final = marker(card) + (usesFacts ? 'Today {{openpulse:fact:0.formattedValue}}.' : 'Today 200 steps.')
      globalThis.fetch = (async () => {
        requests++
        return eventsResponse([
          ...messageEvents('I found your step record.', 0, hasMessageIdentity ? 'commentary' : undefined),
          ...messageEvents(final, 1, hasMessageIdentity ? 'final' : undefined)
        ])
      }) as typeof fetch
      await runChat(sender as unknown as WebContents, 'commentary-chat', 'commentary-run', [{ role: 'user', text: 'How many steps today?' }], (_event, answer) => {
        if (answer) previews.push(answer)
      })
      expect(requests).toBe(1)
      expect(sender.events.some((event) => event.type === 'tool' && event.name === 'finish_answer')).toBe(false)
      const text = 'I found your step record.\n\nToday 200 steps.'
      expect(sender.events.filter((event) => event.type === 'delta').map((event) => event.text).join('')).toBe(text)
      expect(sender.events.find((event) => event.type === 'done')).toMatchObject({ text, parts: [{ type: 'metric-card', value: 200 }] })
      expect(previews).toEqual([{ query: 'How many steps today?', text: 'Today 200 steps.' }])
      expect(displayed(sender.events)).toBe(text)
    })
  }
}

test('commentary and final citations keep their own text offsets', async () => {
  const sender = new Sender()
  const commentary = 'Walking helps.'
  const final = 'Today 200 steps.'
  globalThis.fetch = (async () => eventsResponse([
    ...messageEvents(commentary, 0, 'commentary', [{ type: 'url_citation', start_index: 0, end_index: commentary.length, url: 'https://example.com/walking', title: 'Walking' }]),
    ...messageEvents(final, 1, 'final', [{ type: 'url_citation', start_index: 0, end_index: final.length, url: 'https://example.com/steps', title: 'Steps' }])
  ])) as typeof fetch
  await runChat(sender as unknown as WebContents, 'separate-cite-chat', 'separate-cite-run', [{ role: 'user', text: 'How many steps?' }])
  const text = displayed(sender.events)
  expect(text).toContain('Walking helps. [1](https://example.com/walking)')
  expect(text).toContain('Today 200 steps. [1](https://example.com/steps)')
})

test('commentary does not permit a presentation comment between prose in the final message', async () => {
  const sender = new Sender()
  let requests = 0
  globalThis.fetch = (async () => ++requests === 1 ? eventsResponse([
    ...messageEvents('I found your record.', 0, 'commentary'),
    ...messageEvents('Today. ' + marker(card) + ' {{openpulse:fact:0.formattedValue}}.', 1, 'final')
  ]) : response(marker(card) + 'Today {{openpulse:fact:0.formattedValue}}.')) as typeof fetch
  await runChat(sender as unknown as WebContents, 'middle-chat', 'middle-run', [{ role: 'user', text: 'How many steps?' }])
  expect(requests).toBe(2)
  expect(sender.events.find((event) => event.type === 'done')).toMatchObject({ text: 'Today 200 steps.', parts: [{ type: 'metric-card', value: 200 }] })
  expect(displayed(sender.events)).toBe('Today 200 steps.')
})

test('validation retry replaces rejected prose without losing earlier progress', async () => {
  const result = await run(['Incorrect first attempt {{openpulse:fact:0.current.value}}.', good])
  expect(result.bodies).toHaveLength(2)
  expect(result.sender.events.filter((event) => event.type === 'replace')[0]).toMatchObject({ text: '' })
  expect(result.done).toMatchObject({ text: 'Today 200 steps versus 100 steps.', parts: [{ type: 'comparison', percentChange: 100 }] })
  expect(displayed(result.sender.events)).toBe('Today 200 steps versus 100 steps.')
})

test('two rejected attempts fall back to a plain answer within three requests', async () => {
  const result = await run(['Bad {{openpulse:fact:0.value}}.', 'Still bad {{openpulse:fact:1.value}}.', 'Today you recorded 200 steps.'])
  expect(result.bodies).toHaveLength(3)
  expect(result.bodies[2].tool_choice).toBe('none')
  expect(String(result.bodies[2].instructions)).not.toContain('Presentation JSON schema')
  expect(result.done).toMatchObject({ text: 'Today you recorded 200 steps.', parts: [] })
  expect(displayed(result.sender.events)).toBe('Today you recorded 200 steps.')
})

test('an invalid card is dropped without a correction when the prose stands alone', async () => {
  const result = await run(['Today you recorded 200 steps. ' + marker({ ...empty, metricCards: [{ datasetId: 'invented', metric: 'steps', date: dateAgo(0) }] })])
  expect(result.bodies).toHaveLength(1)
  expect(result.sender.events.some((event) => event.type === 'tool' && event.name === 'finish_answer')).toBe(false)
  expect(result.done).toMatchObject({ text: 'Today you recorded 200 steps.', parts: [] })
  expect(displayed(result.sender.events)).toBe('Today you recorded 200 steps.')
})

test('an invalid answer on the last tool turn falls back to plain prose instead of an error', async () => {
  const sender = new Sender()
  const bodies: Record<string, unknown>[] = []
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    bodies.push(body)
    if (body.tool_choice === 'auto') return eventsResponse([{ type: 'response.output_item.done', item: {
      type: 'function_call', name: 'query_daily_metrics', call_id: `turn-${bodies.length}`,
      arguments: JSON.stringify({ metrics: ['steps'], startDate: dateAgo(200 + bodies.length), endDate: dateAgo(200 + bodies.length) })
    } }])
    return response(String(body.instructions).includes('Presentation JSON schema') ? 'Bad {{openpulse:fact:0.value}}.' : 'Today you recorded 200 steps.')
  }) as typeof fetch
  await runChat(sender as unknown as WebContents, 'last-chat', 'last-run', [{ role: 'user', text: 'Investigate my steps' }])
  expect(bodies).toHaveLength(9)
  expect(bodies.slice(0, 7).every((body) => body.tool_choice === 'auto')).toBe(true)
  expect(bodies[8]).toMatchObject({ tool_choice: 'none' })
  expect(String(bodies[8].instructions)).not.toContain('Presentation JSON schema')
  expect(sender.events.find((event) => event.type === 'done')).toMatchObject({ text: 'Today you recorded 200 steps.', parts: [] })
  displayed(sender.events)
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

test('a leading card comment never misplaces citation markers', async () => {
  const sender = new Sender()
  const raw = marker(card) + 'Walking more helps. Today counts.'
  const at = raw.indexOf('Walking')
  globalThis.fetch = (async () => response(raw, [
    { type: 'url_citation', start_index: at, end_index: at + 'Walking more helps.'.length, url: 'https://example.com/walking', title: 'Walking' }
  ])) as typeof fetch
  await runChat(sender as unknown as WebContents, 'cite-chat', 'cite-run', [{ role: 'user', text: 'Does walking help?' }])
  const done = sender.events.find((event) => event.type === 'done')
  expect(done).toMatchObject({ parts: [{ type: 'metric-card' }] })
  const text = done?.type === 'done' ? done.text : ''
  // Offsets counted against the raw reply would land inside the prose.
  expect(text.startsWith('Walking more helps. Today counts.')).toBe(true)
  expect(text).toContain('https://example.com/walking')
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
  test(`${interruption} after commentary keeps streamed final facts without partial markup`, async () => {
    const sender = new Sender()
    const encoder = new TextEncoder()
    const events = [
      ...messageEvents('I found your record.', 0, 'commentary'),
      { type: 'response.output_item.added', output_index: 1, item: { type: 'message', id: 'final-message', channel: 'final' } },
      { type: 'response.output_text.delta', output_index: 1, item_id: 'final-message', delta: marker(card) + 'Today {{openpulse:fact:0.formattedValue}}. Next {{openpulse:fact:0.value' }
    ]
    globalThis.fetch = (async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(events.map((event) => 'data: ' + JSON.stringify(event) + '\n\n').join('')))
      },
      pull(controller) {
        if (interruption === 'stop') {
          cancelChat(sender as unknown as WebContents, 'commentary-stop-chat', 'commentary-stop-run')
          controller.error(new Error('Aborted stream'))
        } else controller.error(new StreamTimeoutError('idle', 'Synthetic timeout.'))
      }
    }), { headers: { 'content-type': 'text/event-stream' } })) as typeof fetch
    await runChat(sender as unknown as WebContents, 'commentary-stop-chat', 'commentary-stop-run', [{ role: 'user', text: 'How many steps?' }])
    expect(sender.events.at(-1)).toMatchObject({ type: 'interrupted' })
    expect(displayed(sender.events)).toBe('I found your record.\n\nToday 200 steps. Next ')
  })

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

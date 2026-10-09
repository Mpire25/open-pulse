// Run in an isolated Bun test process because module mocks are process-global.
// Drives the eval runtime end to end with a scripted Responses API, so the
// wiring (mocks, session store, recorder, scoring) is tested without network.
import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PLAN_SCOPE } from '../../src/main/chatgpt-protocol'

const temporary = mkdtempSync(join(tmpdir(), 'openpulse-eval-session-'))
afterAll(() => rmSync(temporary, { recursive: true, force: true }))

// Never touch the developer's real eval session.
const sessionDir = join(temporary, 'session')
process.env.OPENPULSE_EVALS_DIR = sessionDir
mkdirSync(sessionDir, { recursive: true })
const tokens = {
  accessToken: 'eval-access-token',
  clientId: 'eval-client',
  subject: 'eval-subject',
  scopes: ['openid', PLAN_SCOPE],
  expiresAt: Date.now() + 60 * 60_000
}
writeFileSync(join(sessionDir, 'store.json'), JSON.stringify({
  secrets: { 'chatgpt-plan-session': { clientId: tokens.clientId, subject: tokens.subject, tokens } },
  local: {}
}))

const { dateAgo, TODAY_STEPS } = await import('../../evals/fixture')

function sse(events: unknown[]): Response {
  const all = [...events, { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 1200, input_tokens_details: { cached_tokens: 1024 }, output_tokens: 40, output_tokens_details: { reasoning_tokens: 12 } } } }]
  return new Response(`${all.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  })
}

const requests: Array<{ url: string; body: Record<string, unknown> }> = []
// A test can script its own responses; the default plays one tool call, then an answer.
let respond: ((body: Record<string, unknown>) => Response) | null = null
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  if (url !== 'https://api.openai.com/v1/responses') throw new Error(`Unexpected request to ${url}`)
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>
  requests.push({ url, body })
  if (respond) return respond(body)
  if (requests.length === 1) {
    return sse([{
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        name: 'query_daily_metrics',
        call_id: 'call-1',
        arguments: JSON.stringify({ metrics: ['steps'], startDate: dateAgo(0), endDate: dateAgo(0) })
      }
    }])
  }
  const text = `You've done ${TODAY_STEPS.toLocaleString('en-GB')} steps so far today.`
  return sse([
    { type: 'response.output_text.delta', delta: text },
    { type: 'response.output_item.done', item: { type: 'message', content: [{ type: 'output_text', text, annotations: [] }] } }
  ])
}) as typeof fetch

const { loadAssistant } = await import('../../evals/runtime')
const { runCase, score } = await import('../../evals/runner')
const { buildCases } = await import('../../evals/cases')
const assistant = await loadAssistant(resolve(import.meta.dir, '../..'), { model: 'eval-model', reasoningEffort: 'low' })

test('runs a case through the real assistant loop and scores it', async () => {
  expect(assistant.getCodexStatus().connected).toBe(true)
  const evalCase = buildCases().find((item) => item.id === 'steps-today')!
  const record = await runCase(assistant, evalCase, 0)

  expect(record.outcome).toBe('completed')
  expect(record.text).toContain(TODAY_STEPS.toLocaleString('en-GB'))
  expect(record.healthCalls).toContainEqual({ fn: 'getSeries', metrics: ['steps'], start: dateAgo(0), end: dateAgo(0), mode: 'await' })
  expect(record.modelRequests).toHaveLength(2)
  expect(record.modelRequests[0]).toMatchObject({
    kind: 'agent',
    toolChoice: 'auto',
    functionCalls: ['query_daily_metrics'],
    inputTokens: 1200,
    cachedTokens: 1024
  })
  expect(record.modelRequests[0].tools).toContain('query_daily_metrics')
  expect(record.firstTextMs).toBeGreaterThanOrEqual(0)
  expect(requests[0].body.model).toBe('eval-model')
  expect(requests[0].body.reasoning).toEqual({ effort: 'low' })

  const result = score(evalCase, record)
  expect(result.passed).toBe(true)
  expect(result.checks.every((check) => check.passed)).toBe(true)
})

test('keeps the eval session private', async () => {
  const store = await import('../../src/main/store')
  store.setLocalValue('chatgpt-host-id', 'urn:uuid:eval')
  expect(statSync(join(sessionDir, 'store.json')).mode & 0o777).toBe(0o600)
  expect(statSync(sessionDir).mode & 0o777).toBe(0o700)
  expect(store.getLocalValue('chatgpt-host-id')).toBe('urn:uuid:eval')
  expect(store.getSecret<{ tokens: { accessToken: string } }>('chatgpt-plan-session')?.tokens.accessToken).toBe('eval-access-token')
})

test('uses a prompt dataset for a card and returns validated facts before the answer', async () => {
  const text = `You've done ${TODAY_STEPS.toLocaleString('en-GB')} steps so far today.`
  respond = () => requests.length === 1 ? sse([{
    type: 'response.output_item.done',
    item: { type: 'function_call', name: 'present_health_data', call_id: 'visual-1',
      arguments: JSON.stringify({ metricCards: [{ datasetId: 'health-table', metric: 'steps', date: dateAgo(0) }] }) }
  }]) : sse([
    { type: 'response.output_text.delta', delta: text },
    { type: 'response.output_item.done', item: { type: 'message', content: [{ type: 'output_text', text, annotations: [] }] } }
  ])
  requests.length = 0
  try {
    const evalCase = buildCases().find((item) => item.id === 'steps-today')!
    const record = await runCase(assistant, evalCase, 0)
    expect(record.outcome).toBe('completed')
    expect(requests).toHaveLength(2)
    const input = requests[0].body.input as Array<{ role?: string; content?: Array<{ text?: string }> }>
    const table = input.find((item) => item.role === 'developer')?.content?.[0]?.text ?? ''
    expect(table).toContain('<OPENPULSE_HEALTH_DATA>')
    expect(table).toContain(`${dateAgo(0)},${TODAY_STEPS}`)
    expect(String(requests[0].body.instructions)).toContain('do not call a tool to re-read data it already contains')
    expect(record.healthCalls.some((call) => call.fn === 'getSeries' && call.mode === 'background' && call.start === dateAgo(179))).toBe(true)
    expect(record.modelRequests[0].dataChars).toBe(table.length)
    expect(record.parts).toHaveLength(1)
    const output = (requests[1].body.input as Array<{ type: string; output?: string }>).find((item) => item.type === 'function_call_output')!
    expect(JSON.parse(output.output!).validatedFacts).toBeDefined()
    expect(score(evalCase, record).passed).toBe(true)
    expect(record.healthCalls.filter((call) => call.fn === 'getSeries')).toHaveLength(2)
  } finally { respond = null }
})

// Run in an isolated Bun test process because module mocks are process-global.
// Drives the eval runtime end to end with a scripted Responses API, so the
// wiring (mocks, session store, recorder, scoring) is tested without network.
import { afterAll, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { generateKeyPair, SignJWT } from 'jose'
import { CHATGPT_ISSUER, PLAN_SCOPE, verifyIdentity } from '../../src/main/chatgpt-protocol'

const temporary = mkdtempSync(join(tmpdir(), 'openpulse-eval-session-'))
const NativeDate = Date
let wallTime = Date.now()
globalThis.Date = new Proxy(NativeDate, {
  construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [wallTime], newTarget),
  get: (target, key, receiver) => key === 'now' ? () => wallTime : Reflect.get(target, key, receiver)
})
afterAll(() => {
  globalThis.Date = NativeDate
  rmSync(temporary, { recursive: true, force: true })
})

// Never touch the developer's real eval session.
const sessionDir = join(temporary, 'session')
process.env.OPENPULSE_EVALS_DIR = sessionDir
mkdirSync(sessionDir, { recursive: true })
const tokens = {
  accessToken: 'eval-access-token',
  clientId: 'eval-client',
  subject: 'eval-subject',
  scopes: ['openid', PLAN_SCOPE],
  expiresAt: Date.now() + 48 * 60 * 60_000
}
writeFileSync(join(sessionDir, 'store.json'), JSON.stringify({
  secrets: { 'chatgpt-plan-session': { clientId: tokens.clientId, subject: tokens.subject, tokens } },
  local: {}
}))

const { dateAgo, pinEvalNow, TODAY_STEPS } = await import('../../evals/fixture')

function sse(events: unknown[]): Response {
  const all = [...events, { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 1200, input_tokens_details: { cached_tokens: 1024 }, output_tokens: 40, output_tokens_details: { reasoning_tokens: 12 } } } }]
  return new Response(`${all.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  })
}

const requests: Array<{ url: string; body: Record<string, unknown> }> = []
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  if (url !== 'https://api.openai.com/v1/responses') throw new Error(`Unexpected request to ${url}`)
  const body = JSON.parse(String(init?.body)) as Record<string, unknown>
  requests.push({ url, body })
  if (requests.length === 1) {
    const today = String(body.instructions).match(/Today is (\d{4}-\d{2}-\d{2})/)![1]
    return sse([{
      type: 'response.output_item.done',
      item: {
        type: 'function_call',
        name: 'query_daily_metrics',
        call_id: 'call-1',
        arguments: JSON.stringify({ metrics: ['steps'], startDate: today, endDate: today })
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
  expect(record.healthCalls).toEqual([{ fn: 'getSeries', metrics: ['steps'], start: dateAgo(0), end: dateAgo(0) }])
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

test('keeps the assistant, tools and scoring on the run date across midnight', async () => {
  const previousWallTime = wallTime
  const runStart = new NativeDate(wallTime)
  runStart.setHours(23, 59, 0, 0)
  pinEvalNow(runStart)
  wallTime = new NativeDate(runStart.getFullYear(), runStart.getMonth(), runStart.getDate() + 1, 0, 1).getTime()
  requests.length = 0
  try {
    const today = dateAgo(0)
    expect(new Date().getTime()).toBe(runStart.getTime())
    expect(Date()).toBe(runStart.toString())
    expect(Date.now()).toBe(wallTime)
    expect(new Date(wallTime).getTime()).toBe(wallTime)

    const evalCase = buildCases().find((item) => item.id === 'steps-today')!
    const record = await runCase(assistant, evalCase, 1)
    expect(String(requests[0].body.instructions)).toContain(`Today is ${today}`)
    expect(record.healthCalls).toEqual([{ fn: 'getSeries', metrics: ['steps'], start: today, end: today }])
    const input = requests[1].body.input as Array<{ type: string; output?: string }>
    const output = JSON.parse(input.find((item) => item.type === 'function_call_output')!.output!)
    expect(output.days[today].steps).toBe(TODAY_STEPS)
    expect(score(evalCase, record).passed).toBe(true)
  } finally {
    pinEvalNow(null)
    wallTime = previousWallTime
  }
})

test('JWT validation uses real time while the eval calendar is pinned', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const now = Math.floor(Date.now() / 1000)
  const sign = (claims: { exp: number; nbf?: number }): Promise<string> =>
    new SignJWT({ sub: 'offline-subject', iat: now - 60, ...claims })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(CHATGPT_ISSUER)
      .setAudience('offline-client')
      .sign(privateKey)
  const expired = await sign({ exp: now - 30 })
  const valid = await sign({ nbf: now - 60, exp: now + 600 })
  pinEvalNow(new NativeDate((now - 600) * 1000))
  try {
    await expect(verifyIdentity(expired, 'offline-client', undefined, async () => publicKey))
      .rejects.toMatchObject({ code: 'ERR_JWT_EXPIRED' })
    await expect(verifyIdentity(valid, 'offline-client', undefined, async () => publicKey))
      .resolves.toMatchObject({ subject: 'offline-subject' })
  } finally {
    pinEvalNow(null)
  }
})

test('keeps the eval session private', async () => {
  const store = await import('../../src/main/store')
  store.setLocalValue('chatgpt-host-id', 'urn:uuid:eval')
  expect(statSync(join(sessionDir, 'store.json')).mode & 0o777).toBe(0o600)
  expect(statSync(sessionDir).mode & 0o777).toBe(0o700)
  expect(store.getLocalValue('chatgpt-host-id')).toBe('urn:uuid:eval')
  expect(store.getSecret<{ tokens: { accessToken: string } }>('chatgpt-plan-session')?.tokens.accessToken).toBe('eval-access-token')
})

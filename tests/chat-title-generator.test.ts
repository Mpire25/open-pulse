import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ChatTitleController, generateChatName, normalizeGeneratedTitle, type ChatTitleModel } from '../src/main/chat-title-generator'
import { ChatGPTRequestError } from '../src/main/chatgpt-responses'
import { ChatHistoryStore } from '../src/main/chat-history-store'
import type { ChatTitleUpdate } from '../src/shared/types'

const originalFetch = globalThis.fetch
const directories: string[] = []
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''))
}
const completed = { type: 'response.completed', response: { status: 'completed' } }

test('standalone Luna request uses only the bounded first prompt and waits for terminal success', async () => {
  let body: Record<string, any> = {}
  globalThis.fetch = (async (_url, options) => {
    body = JSON.parse(options!.body as string)
    expect(new Headers(options!.headers).get('authorization')).toBe('Bearer synthetic-token')
    return stream([{ type: 'response.output_text.delta', delta: 'Weekly sleep comparison' }, completed])
  }) as typeof fetch
  expect(await generateChatName('synthetic-token', 'Compare my sleep '.repeat(500), new AbortController().signal)).toBe('Weekly sleep comparison')
  expect(body.model).toBe('gpt-5.6-luna')
  expect(body.reasoning).toEqual({ effort: 'low' })
  expect(body.store).toBe(false)
  expect(body.stream).toBe(true)
  expect(body.tools).toEqual([])
  expect(body.input).toHaveLength(1)
  expect(body.input[0].content[0].text).toHaveLength(4000)
  // These public API fields are explicitly unsupported on the ChatGPT plan route.
  for (const field of ['max_output_tokens', 'max_tool_calls', 'background', 'temperature', 'top_p', 'previous_response_id']) {
    expect(body).not.toHaveProperty(field)
  }
})

test('partial titles, incomplete responses and late usage errors are never accepted', async () => {
  for (const terminal of [null, { type: 'response.incomplete' }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }]) {
    globalThis.fetch = (async () => stream([{ type: 'response.output_text.delta', delta: 'Sleep summary' }, ...(terminal ? [terminal] : [])])) as typeof fetch
    await expect(generateChatName('synthetic', 'Sleep?', new AbortController().signal)).rejects.toThrow()
  }
})

test('backup request uses its selected model and smallest reasoning effort', async () => {
  globalThis.fetch = (async (_url, options) => {
    const body = JSON.parse(options!.body as string)
    expect(body.model).toBe('assistant-model')
    expect(body.reasoning).toEqual({ effort: 'none' })
    return stream([{ type: 'response.output_text.delta', delta: 'Sleep comparison' }, completed])
  }) as typeof fetch
  expect(await generateChatName('synthetic', 'Sleep?', new AbortController().signal, { model: 'assistant-model', reasoningEffort: 'none' })).toBe('Sleep comparison')
})

test('refusals and unsuitable titles keep the fallback; Unicode titles remain intact', async () => {
  for (const value of ['', 'New chat', 'Sorry, I cannot help', '## Sleep', 'Title\nMore text', 'a'.repeat(81), 'Sleep\u202Esummary']) {
    expect(normalizeGeneratedTitle(value)).toBeNull()
  }
  expect(normalizeGeneratedTitle('“Weekly sleep comparison”')).toBe('Weekly sleep comparison')
  expect(normalizeGeneratedTitle('睡眠变化总结')).toBe('睡眠变化总结')
  expect(normalizeGeneratedTitle('👩🏽‍⚕️'.repeat(80))).toBe('👩🏽‍⚕️'.repeat(80))
  globalThis.fetch = (async () => stream([{ type: 'response.refusal.delta', delta: 'Cannot help' }, completed])) as typeof fetch
  expect(await generateChatName('synthetic', 'prompt', new AbortController().signal)).toBeNull()
})

function harness(timeoutMs = 10_000) {
  const directory = mkdtempSync(join(tmpdir(), 'openpulse-title-test-')); directories.push(directory)
  const path = join(directory, 'history.json')
  const encryption = { available: () => true, encrypt: (text: string) => Buffer.from(text), decrypt: (value: Buffer) => value.toString() }
  const store = new ChatHistoryStore(path, encryption)
  const chat = store.create('health-account-a', 'chat-a')
  const message = { id: 'prompt-a', role: 'user' as const, text: 'Compare my sleep this week', createdAt: new Date().toISOString() }
  const session = store.update('health-account-a', chat.id, [message])
  let resolve!: (title: string | null) => void
  let generateCalls = 0
  let modelCalls = 0
  let available = true
  let models: ChatTitleModel[] = [{ model: 'gpt-5.6-luna', reasoningEffort: 'low' }]
  let outcomes: Array<string | null | Error | 'timeout'> | undefined
  const selections: ChatTitleModel[] = []
  let current = true
  let failures = 0
  const published: ChatTitleUpdate[] = []
  const parent = new AbortController()
  const controller = new ChatTitleController({
    claim: (scope, id, messageId) => store.claimTitle(scope, id, messageId),
    complete: (scope, id, prompt, title) => store.completeTitle(scope, id, prompt, title),
    models: async () => { modelCalls++; return available ? models : [] },
    generate: async (_token, prompt, signal, selection) => {
      expect(prompt).toBe(message.text)
      generateCalls++
      selections.push(selection)
      if (outcomes) {
        const outcome = outcomes.shift()
        if (outcome === 'timeout') return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }))
        if (outcome instanceof Error) throw outcome
        return outcome ?? null
      }
      return new Promise<string | null>((done) => { resolve = done })
    },
    publish: (_sender, title) => published.push(title),
    failed: () => { failures++ }, timeoutMs, attemptTimeoutMs: 20
  })
  controller.remember(1, 'health-account-a', session)
  const start = () => controller.start(1, chat.id, { accessToken: 'synthetic', clientId: 'registration' }, parent.signal, () => current, 'gpt-6-astra')
  return { controller, store, session, message, published, parent, start, path, encryption, selections,
    setModels: (value: ChatTitleModel[]) => { models = value },
    outcomes: (value: Array<string | null | Error | 'timeout'>) => { outcomes = value },
    resolve: (title: string | null) => resolve(title),
    calls: () => ({ generateCalls, modelCalls, failures }),
    unavailable: () => { available = false }, obsolete: () => { current = false } }
}

describe('chat title lifecycle', () => {
  const backup: ChatTitleModel = { model: 'gpt-6-astra', reasoningEffort: 'low' }
  const luna: ChatTitleModel = { model: 'gpt-5.6-luna', reasoningEffort: 'low' }
  test('Luna success does not invoke the assistant backup', async () => {
    const h = harness(); h.setModels([luna, backup]); h.outcomes(['Luna title'])
    await h.start()
    expect(h.selections).toEqual([luna])
    expect(h.published[0].title).toBe('Luna title')
  })
  test('missing Luna directly uses the assistant backup', async () => {
    const h = harness(); h.setModels([backup]); h.outcomes(['Assistant title'])
    await h.start()
    expect(h.selections).toEqual([backup])
    expect(h.published[0].title).toBe('Assistant title')
  })
  for (const failure of [null, new Error('Incomplete response'), new ChatGPTRequestError('Unsupported capability', false), 'timeout'] as const) {
    test(`Luna ${failure === null ? 'invalid output' : failure === 'timeout' ? 'timeout' : 'failure'} falls back once`, async () => {
      const h = harness(); h.setModels([luna, backup]); h.outcomes([failure, 'Assistant title'])
      await h.start(); await h.start()
      expect(h.selections).toEqual([luna, backup])
      expect(h.published[0].title).toBe('Assistant title')
      expect(h.calls().generateCalls).toBe(2)
    })
  }
  test('both failures retain the first prompt and do not retry later', async () => {
    const h = harness(); h.setModels([luna, backup]); h.outcomes([new Error('Luna failed'), null])
    await h.start(); await h.start()
    expect(h.calls().generateCalls).toBe(2)
    expect(h.published).toHaveLength(0)
    expect(h.controller.title(1, 'chat-a')).toBe(h.session.title)
  })
  test('same model is never attempted twice', async () => {
    const h = harness(); h.setModels([luna, luna]); h.outcomes([null])
    await h.start()
    expect(h.calls().generateCalls).toBe(1)
  })
  for (const boundary of ['usage-limit', 'authentication', 'permission'] as const) {
    test(`${boundary} failure stops without using another model`, async () => {
      const h = harness(); h.setModels([luna, backup]); h.outcomes([new ChatGPTRequestError(boundary, true), 'Never returned'])
      await h.start()
      expect(h.selections).toEqual([luna])
      expect(h.published).toHaveLength(0)
      expect(h.calls().failures).toBe(1)
    })
  }
  test('notification fallback survives failed history saves and later queries without replacing a known name', async () => {
    const h = harness(); h.controller.clear()
    // Creation succeeded, but the first message save did not publish a title.
    h.controller.remember(1, 'health-account-a', { ...h.session, title: 'New chat', messages: [] })
    h.controller.rememberFallback(1, 'chat-a', 'First prompt about sleep')
    h.controller.rememberFallback(1, 'chat-a', 'A completely different follow-up')
    expect(h.controller.title(1, 'chat-a')).toBe('First prompt about sleep')
    await h.start()
    expect(h.calls().generateCalls).toBe(0)
    h.controller.remember(1, 'health-account-a', { ...h.session, title: 'Generated name', titleGeneration: 'generated' })
    h.controller.rememberFallback(1, 'chat-a', 'Follow-up')
    expect(h.controller.title(1, 'chat-a')).toBe('Generated name')
  })
  test('updates metadata once without losing a concurrent answer or changing retention/pin flags', async () => {
    const h = harness()
    const operation = h.start()
    await Promise.resolve()
    const answer = { id: 'answer', role: 'assistant' as const, text: 'Your sleep improved.', createdAt: h.message.createdAt }
    const saved = h.store.update('health-account-a', 'chat-a', [h.message, answer])
    h.store.setPinned('health-account-a', 'chat-a', true)
    h.store.setKept('health-account-a', 'chat-a', true)
    h.resolve('Weekly sleep comparison'); await operation
    const named = h.store.snapshot('health-account-a').sessions[0]
    expect(named).toMatchObject({ title: 'Weekly sleep comparison', titleGeneration: 'generated', updatedAt: saved.updatedAt, pinned: true, kept: true })
    expect(named.messages).toEqual([h.message, answer])
    expect(h.published).toHaveLength(1)
    expect(h.controller.title(1, 'chat-a')).toBe('Weekly sleep comparison')
    h.controller.remember(1, 'health-account-a', named)
    await h.start()
    expect(h.calls().generateCalls).toBe(1)
    const restored = new ChatHistoryStore(h.path, h.encryption)
    expect(restored.snapshot('health-account-a').sessions[0].title).toBe('Weekly sleep comparison')
    expect(restored.claimTitle('health-account-a', 'chat-a', h.message.id)).toBe(false)
  })

  test('missing Luna keeps the fallback and records the attempt across restart', async () => {
    const h = harness(); h.unavailable(); await h.start(); await h.start()
    expect(h.calls().generateCalls).toBe(0)
    expect(h.store.snapshot('health-account-a').sessions[0]).toMatchObject({ title: h.session.title, titleGeneration: 'attempted' })
    expect(new ChatHistoryStore(h.path, h.encryption).claimTitle('health-account-a', 'chat-a', h.message.id)).toBe(false)
  })

  test('invalid output leaves the fallback and is not retried', async () => {
    const h = harness(); const operation = h.start(); await Promise.resolve()
    h.resolve(null); await operation; await h.start()
    expect(h.calls().generateCalls).toBe(1)
    expect(h.published).toHaveLength(0)
    expect(h.controller.title(1, 'chat-a')).toBe(h.session.title)
  })

  test('legacy chats and empty drafts never start a naming request', async () => {
    const h = harness(); h.controller.clear()
    h.controller.remember(1, 'health-account-a', { ...h.session, titleGeneration: undefined })
    await h.start()
    h.controller.remember(1, 'health-account-a', { ...h.session, messages: [] })
    await h.start()
    expect(h.calls()).toEqual({ generateCalls: 0, modelCalls: 0, failures: 0 })
  })

  for (const boundary of ['delete', 'retention', 'account', 'window', 'cancel', 'auth', 'timeout'] as const) {
    test(`discards late names after ${boundary}`, async () => {
      const h = harness(boundary === 'timeout' ? 1 : 10_000)
      const operation = h.start(); await Promise.resolve()
      if (boundary === 'delete') { h.store.delete('health-account-a', 'chat-a'); h.controller.clearChat('chat-a') }
      if (boundary === 'retention') h.controller.retainChats(1, new Set())
      if (boundary === 'account') h.controller.clear()
      if (boundary === 'window') h.controller.clearSender(1)
      if (boundary === 'cancel') h.parent.abort()
      if (boundary === 'auth') h.obsolete()
      if (boundary === 'timeout') await Bun.sleep(5)
      h.resolve('Late name'); await operation
      expect(h.published).toHaveLength(0)
      expect(h.store.snapshot('health-account-a').sessions[0]?.title).not.toBe('Late name')
      expect(h.store.snapshot('health-account-b').sessions).toEqual([])
    })
  }
})

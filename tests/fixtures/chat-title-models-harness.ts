import { afterEach, expect, mock, test } from 'bun:test'
import type { ModelCatalog } from '../../src/shared/types'
let cached: ModelCatalog | undefined
mock.module('../../src/main/store', () => ({
  getLocalValue: (key: string) => { expect(key).toBe('chatgpt-models:synthetic-registration'); return cached },
  setLocalValue: () => { throw new Error('Naming must not write a stale account catalog') }
}))
mock.module('../../src/main/codex-auth', () => ({
  getCodexAuthGeneration: () => { throw new Error('No credential access from naming') },
  getCodexStatus: () => { throw new Error('No credential access from naming') },
  getCodexTokens: () => { throw new Error('No credential access from naming') },
  isCodexAuthGenerationCurrent: () => { throw new Error('No credential access from naming') }
}))
const { chatTitleModelAvailable } = await import('../../src/main/chatgpt-models')
const originalFetch = globalThis.fetch
const tokens = { clientId: 'synthetic-registration', accessToken: 'synthetic-token' }
const signal = () => new AbortController().signal
afterEach(() => { globalThis.fetch = originalFetch; cached = undefined })

test('fresh account catalog is reused without credential reads or network calls', async () => {
  globalThis.fetch = (async () => { throw new Error('Unexpected request') }) as typeof fetch
  cached = { models: [{ id: 'gpt-6-luna', label: 'Luna', efforts: ['auto', 'low'] }], stale: false, fetchedAt: Date.now() }
  expect(await chatTitleModelAvailable(tokens, signal())).toBe(true)
  cached.models[0].efforts = ['auto', 'high']
  expect(await chatTitleModelAvailable(tokens, signal())).toBe(false)
  cached.models = [{ id: 'gpt-6-astra', label: 'Astra' }]
  expect(await chatTitleModelAvailable(tokens, signal())).toBe(false)
})

test('missing or stale catalog is discovered with the existing run token and cancellation signal', async () => {
  let calls = 0
  const requestSignal = signal()
  globalThis.fetch = (async (url, options) => {
    calls++
    expect(String(url)).toBe('https://api.openai.com/v1/models')
    expect(new Headers(options!.headers).get('authorization')).toBe('Bearer synthetic-token')
    expect(options!.signal).toBe(requestSignal)
    return Response.json({ models: [{ slug: 'gpt-6-luna', visibility: 'list', supported_reasoning_levels: ['low'] }] })
  }) as typeof fetch
  expect(await chatTitleModelAvailable(tokens, requestSignal)).toBe(true)
  cached = { models: [], stale: true, fetchedAt: Date.now() }
  expect(await chatTitleModelAvailable(tokens, requestSignal)).toBe(true)
  expect(calls).toBe(2)
})

test('catalog failures make no second attempt', async () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; return Response.json({ error: { code: 'subscription_sharing_usage_limit_exceeded' } }, { status: 429 }) }) as typeof fetch
  await expect(chatTitleModelAvailable(tokens, signal())).rejects.toThrow('ChatGPT usage limit reached')
  expect(calls).toBe(1)
})

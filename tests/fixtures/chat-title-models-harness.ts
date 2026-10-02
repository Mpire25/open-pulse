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
const { getChatTitleModels, parseModels, selectChatTitleModels } = await import('../../src/main/chatgpt-models')
const originalFetch = globalThis.fetch
const tokens = { clientId: 'synthetic-registration', accessToken: 'synthetic-token' }
const signal = () => new AbortController().signal
afterEach(() => { globalThis.fetch = originalFetch; cached = undefined })

test('fresh account catalog is reused without credential reads or network calls', async () => {
  globalThis.fetch = (async () => { throw new Error('Unexpected request') }) as typeof fetch
  // Matches the real catalog that exposed the incorrect Luna slug.
  cached = { models: [
    { id: 'gpt-6-astra', label: 'Astra', efforts: ['auto', 'high', 'low'] },
    { id: 'gpt-5.6-luna', label: 'Luna', efforts: ['auto', 'low'] }
  ], stale: false, fetchedAt: Date.now() }
  expect(await getChatTitleModels(tokens, 'gpt-6-astra', signal())).toEqual([
    { model: 'gpt-5.6-luna', reasoningEffort: 'low' }, { model: 'gpt-6-astra', reasoningEffort: 'low' }
  ])
  cached.models = [{ id: 'gpt-6-astra', label: 'Astra', efforts: ['auto', 'high', 'medium'] }]
  expect(await getChatTitleModels(tokens, 'gpt-6-astra', signal())).toEqual([{ model: 'gpt-6-astra', reasoningEffort: 'medium' }])
})

test('missing or stale catalog is discovered with the existing run token and cancellation signal', async () => {
  let calls = 0
  const requestSignal = signal()
  globalThis.fetch = (async (url, options) => {
    calls++
    expect(String(url)).toBe('https://api.openai.com/v1/models')
    expect(new Headers(options!.headers).get('authorization')).toBe('Bearer synthetic-token')
    expect(options!.signal).toBe(requestSignal)
    return Response.json({ models: [{ slug: 'gpt-5.6-luna', visibility: 'list', supported_reasoning_levels: ['low'] }] })
  }) as typeof fetch
  expect(await getChatTitleModels(tokens, 'gpt-6-astra', requestSignal)).toEqual([
    { model: 'gpt-5.6-luna', reasoningEffort: 'low' }, { model: 'gpt-6-astra', reasoningEffort: 'low' }
  ])
  cached = { models: [], stale: true, fetchedAt: Date.now() }
  expect((await getChatTitleModels(tokens, 'gpt-6-astra', requestSignal))[0].model).toBe('gpt-5.6-luna')
  expect(calls).toBe(2)
})

test('catalog failures make no second attempt', async () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; return Response.json({ error: { code: 'subscription_sharing_usage_limit_exceeded' } }, { status: 429 }) }) as typeof fetch
  await expect(getChatTitleModels(tokens, 'gpt-6-astra', signal())).rejects.toThrow('ChatGPT usage limit reached')
  expect(calls).toBe(1)
})

test('backup uses none when advertised, without adding a new assistant UI setting', () => {
  const models = parseModels({ models: [
    { slug: 'gpt-5.6-sol', visibility: 'list', supported_reasoning_levels: ['high', { effort: 'none' }, 'low'] }
  ] })
  expect(models[0].efforts).toEqual(['auto', 'high', 'low'])
  expect(models[0].supportsNoReasoning).toBe(true)
  expect(selectChatTitleModels(models, 'gpt-5.6-sol')).toEqual([{ model: 'gpt-5.6-sol', reasoningEffort: 'none' }])
})

test('selected Luna is not duplicated as its own backup', () => {
  expect(selectChatTitleModels([{ id: 'gpt-5.6-luna', label: 'Luna', efforts: ['auto', 'low'] }], 'gpt-5.6-luna'))
    .toEqual([{ model: 'gpt-5.6-luna', reasoningEffort: 'low' }])
})

test('temporary catalog failure uses the selected assistant with no credential or catalog retry', async () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; throw new TypeError('Network unavailable') }) as typeof fetch
  expect(await getChatTitleModels(tokens, 'gpt-6-astra', signal())).toEqual([{ model: 'gpt-6-astra', reasoningEffort: 'low' }])
  expect(calls).toBe(1)
})

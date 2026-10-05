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
    { id: 'gpt-6-astra', label: 'Astra', efforts: ['high', 'low'] },
    { id: 'gpt-5.6-luna', label: 'Luna', efforts: ['low'] }
  ], stale: false, fetchedAt: Date.now(), effortsVersion: 3 }
  expect(await getChatTitleModels(tokens, 'gpt-6-astra', signal())).toEqual([
    { model: 'gpt-5.6-luna', reasoningEffort: 'low' }, { model: 'gpt-6-astra', reasoningEffort: 'high' }
  ])
  cached.models = [{ id: 'gpt-6-astra', label: 'Astra', efforts: ['high', 'medium'] }]
  expect(await getChatTitleModels(tokens, 'gpt-6-astra', signal())).toEqual([{ model: 'gpt-6-astra', reasoningEffort: 'high' }])
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
    { model: 'gpt-5.6-luna', reasoningEffort: 'low' }, { model: 'gpt-6-astra', reasoningEffort: undefined }
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

test('none is preserved from the catalog and used for naming when advertised', () => {
  const models = parseModels({ models: [
    { slug: 'gpt-5.6-sol', visibility: 'list', supported_reasoning_levels: ['high', { effort: 'none' }, 'low'] }
  ] })
  expect(models[0].efforts).toEqual(['high', 'none', 'low'])
  expect(models[0].supportsNoReasoning).toBe(true)
  expect(selectChatTitleModels(models, 'gpt-5.6-sol')).toEqual([{ model: 'gpt-5.6-sol', reasoningEffort: 'none' }])
})

test('selected Luna is not duplicated as its own backup', () => {
  expect(selectChatTitleModels([{ id: 'gpt-5.6-luna', label: 'Luna', efforts: ['low'] }], 'gpt-5.6-luna'))
    .toEqual([{ model: 'gpt-5.6-luna', reasoningEffort: 'low' }])
})

test('temporary catalog failure uses the selected assistant with no credential or catalog retry', async () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; throw new TypeError('Network unavailable') }) as typeof fetch
  expect(await getChatTitleModels(tokens, 'gpt-6-astra', signal())).toEqual([{ model: 'gpt-6-astra', reasoningEffort: undefined }])
  expect(calls).toBe(1)
})

test('effort discovery retains new tiers in response order without accepting malformed IDs', () => {
  const models = parseModels({ models: [{
    slug: 'future-model', visibility: 'list',
    supported_reasoning_levels: ['auto', 'ultra', { effort: 'new-tier' }, 'ultra', null, 42, {}, { effort: false }, '', 'bad tier']
  }] })
  expect(models[0].efforts).toEqual(['ultra', 'new-tier'])
  expect(selectChatTitleModels(models, 'future-model')).toEqual([{ model: 'future-model', reasoningEffort: 'ultra' }])
  expect(selectChatTitleModels([{ id: 'gpt-5.6-luna', label: 'Luna' }], 'gpt-5.6-luna'))
    .toEqual([{ model: 'gpt-5.6-luna', reasoningEffort: undefined }])
})

test('only supported catalog defaults are retained, while naming keeps the first advertised effort', () => {
  const models = parseModels({ models: [
    { slug: 'future-model', visibility: 'list', supported_reasoning_levels: ['low', { effort: 'new-tier' }], default_reasoning_level: 'new-tier' },
    { slug: 'unsupported-default', visibility: 'list', supported_reasoning_levels: ['low'], default_reasoning_level: 'medium' },
    { slug: 'missing-default', visibility: 'list', supported_reasoning_levels: ['low'] },
    { slug: 'invalid-default', visibility: 'list', supported_reasoning_levels: ['low'], default_reasoning_level: { effort: 'low' } },
    { slug: 'legacy-default', visibility: 'list', supported_reasoning_levels: ['auto', 'low'], default_reasoning_level: 'auto' },
    { slug: 'missing-levels', visibility: 'list', default_reasoning_level: 'medium' }
  ] })
  expect(models[0].defaultEffort).toBe('new-tier')
  expect(models.slice(1).every((model) => model.defaultEffort === undefined)).toBe(true)
  expect(selectChatTitleModels(models, 'future-model')).toEqual([{ model: 'future-model', reasoningEffort: 'low' }])
})

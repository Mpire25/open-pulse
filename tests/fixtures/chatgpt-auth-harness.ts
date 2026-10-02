import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { TokenExchangeError } from '../../src/main/chatgpt-protocol'
import type { CodexTokens } from '../../src/main/codex-auth'
const originalFetch = globalThis.fetch
const secrets = new Map<string, unknown>(),
  local = new Map<string, unknown>()
let exchange: (body: URLSearchParams) => Promise<unknown>
let subject = 'user-a',
  scopes = 'chatgpt.tokens.use.direct offline_access'
let callbackFailure = false
let exchanges = 0
mock.module('electron', () => ({
  shell: {
    openExternal: async (url: string) => {
      const authorization = new URL(url)
      expect(authorization.origin + authorization.pathname).toBe(
        'https://auth.openai.com/api/accounts/authorize'
      )
      expect(authorization.searchParams.get('resource')).toBe(
        'https://api.openai.com/v1'
      )
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      expect(callback.hostname).toBe('127.0.0.1')
      expect(callback.port).not.toBe('1455')
      callback.search = new URLSearchParams({
        state: callbackFailure
          ? 'wrong'
          : authorization.searchParams.get('state')!,
        code: 'test-code',
        client_id:
          authorization.searchParams.get('client_id') === 'dynamic_agent_client'
            ? 'issued-a'
            : authorization.searchParams.get('client_id')!
      }).toString()
      await originalFetch(callback)
    }
  }
}))
mock.module('../../src/main/store', () => ({
  getSecret: (key: string) => structuredClone(secrets.get(key) ?? null),
  setSecret: (key: string, value: unknown) =>
    secrets.set(key, structuredClone(value)),
  deleteSecret: (key: string) => secrets.delete(key),
  hasSecret: (key: string) => secrets.has(key),
  getLocalValue: (key: string) => structuredClone(local.get(key)),
  setLocalValue: (key: string, value: unknown) =>
    local.set(key, structuredClone(value))
}))
mock.module('../../src/main/chatgpt-protocol', () => ({
  TokenExchangeError,
  CHATGPT_ISSUER: 'https://auth.openai.com',
  CHATGPT_RESOURCE: 'https://api.openai.com/v1',
  CHATGPT_SCOPE:
    'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
  PLAN_SCOPE: 'chatgpt.tokens.use.direct',
  validateCallback: (
    params: URLSearchParams,
    state: string,
    saved?: string
  ) => {
    if (params.get('state') !== state) throw new Error('OAuth state mismatch.')
    return {
      code: params.get('code'),
      clientId: params.get('client_id') ?? saved
    }
  },
  verifyIdentity: async () => ({ subject, email: 'test@example.invalid' }),
  exchangeToken: async (body: URLSearchParams) => {
    exchanges++
    return exchange(body)
  },
  unusableRefresh: (error: unknown) =>
    error instanceof TokenExchangeError && error.code === 'invalid_grant',
  getDiscovery: async () => ({
    revocation_endpoint: 'https://auth.openai.com/revoke'
  })
}))
const auth = await import('../../src/main/codex-auth')
const { getChatGPTModels, parseModels } =
  await import('../../src/main/chatgpt-models')
const KEY = 'chatgpt-plan-registrations'
function seed(overrides: Partial<CodexTokens> = {}): void {
  const tokens = {
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    idToken: 'test-id',
    clientId: 'issued-a',
    subject: 'user-a',
    scopes: scopes.split(' '),
    expiresAt: Date.now() + 3600_000,
    ...overrides
  }
  secrets.set(KEY, {
    active: 'issued-a',
    registrations: {
      'issued-a': { clientId: 'issued-a', subject: 'user-a', tokens }
    }
  })
}
beforeEach(() => {
  secrets.clear()
  local.clear()
  subject = 'user-a'
  scopes = 'chatgpt.tokens.use.direct offline_access'
  callbackFailure = false
  exchanges = 0
  exchange = async () => ({
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    id_token: 'new-id',
    expires_in: 3600,
    scope: scopes,
    token_type: 'Bearer'
  })
})
afterEach(() => {
  globalThis.fetch = originalFetch
})
test('legacy credentials require reconnect, successful migration preserves settings and removes legacy tokens', async () => {
  secrets.set('codex-tokens', { accessToken: 'legacy' })
  local.set('unrelated-setting', 'keep')
  expect(auth.getCodexStatus()).toMatchObject({
    connected: false,
    needsReconnect: true
  })
  expect(await auth.connectCodex()).toMatchObject({
    connected: true,
    signedIn: true,
    activeRegistration: 'issued-a'
  })
  expect(secrets.has('codex-tokens')).toBe(false)
  expect(local.get('unrelated-setting')).toBe('keep')
})
test('failed callback never exchanges tokens or deletes the existing session', async () => {
  seed()
  callbackFailure = true
  await expect(auth.connectCodex('issued-a')).rejects.toThrow('state')
  expect(exchanges).toBe(0)
  expect((await auth.getCodexTokens())?.accessToken).toBe('test-access')
})
test('a changed identity cannot overwrite a saved registration', async () => {
  seed()
  subject = 'other-user'
  await expect(auth.connectCodex('issued-a')).rejects.toThrow(
    'different identity'
  )
  expect((await auth.getCodexTokens())?.accessToken).toBe('test-access')
})
test('missing plan consent retains identity without enabling inference', async () => {
  scopes = 'openid email offline_access'
  expect(await auth.connectCodex()).toMatchObject({
    signedIn: true,
    connected: false,
    planEnabled: false
  })
  await expect(auth.getCodexTokens()).rejects.toThrow(
    'Enable ChatGPT plan usage'
  )
})
test('concurrent consumers share a rotating refresh and cancellation does not discard replacement tokens', async () => {
  seed({ expiresAt: 1 })
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  exchange = async (body) => {
    expect(body.get('client_id')).toBe('issued-a')
    expect(body.has('scope')).toBe(false)
    await blocked
    return {
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
      expires_in: 3600,
      scope: scopes
    }
  }
  const controller = new AbortController()
  const cancelled = auth.getCodexTokens(controller.signal)
  const second = auth.getCodexTokens()
  controller.abort()
  await expect(cancelled).rejects.toThrow()
  release()
  expect((await second)?.refreshToken).toBe('rotated-refresh')
  expect(exchanges).toBe(1)
  expect((await auth.getCodexTokens())?.accessToken).toBe('rotated-access')
})
test('terminal refresh rejection clears credentials, temporary failures preserve them', async () => {
  seed({ expiresAt: 1 })
  exchange = async () => {
    throw new Error('network unavailable')
  }
  await expect(auth.getCodexTokens()).rejects.toThrow('network')
  expect(auth.getCodexStatus().signedIn).toBe(true)
  exchange = async () => {
    throw new TokenExchangeError(400, 'invalid_grant')
  }
  await expect(auth.getCodexTokens()).rejects.toThrow('no longer valid')
  expect(auth.getCodexStatus().signedIn).toBe(false)
  expect(auth.getCodexStatus().accounts).toHaveLength(1)
})
test('disconnect revokes and clears tokens while retaining the registration', async () => {
  seed()
  globalThis.fetch = (async (input, init) => {
    expect(String(input)).toBe('https://auth.openai.com/revoke')
    expect(new URLSearchParams(String(init?.body)).get('client_id')).toBe(
      'issued-a'
    )
    return new Response('', { status: 200 })
  }) as typeof fetch
  expect(await auth.disconnectCodex()).toEqual({ warning: undefined })
  expect(auth.getCodexStatus()).toMatchObject({
    signedIn: false,
    accounts: [{ id: 'issued-a' }]
  })
})
test('model catalog preserves ordering, filters hidden/duplicate/invalid models and handles new IDs', () => {
  expect(
    parseModels({
      models: [
        {
          slug: 'future-model',
          display_name: 'Future',
          visibility: 'list',
          supported_reasoning_levels: [
            { effort: 'low' },
            { effort: 'new-tier' }
          ]
        },
        { slug: 'hidden', visibility: 'hide' },
        { slug: 'future-model', visibility: 'list' },
        { slug: 'other', visibility: 'list' },
        { slug: 'invalid name', visibility: 'list' }
      ]
    })
  ).toEqual([
    { id: 'future-model', label: 'Future', efforts: ['auto', 'low'] },
    { id: 'other', label: 'other' }
  ])
})
test('catalog refresh caches per registration and falls back without erasing successful data', async () => {
  seed()
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    return Response.json({
      models: [{ slug: 'new-model', visibility: 'list', display_name: 'New' }]
    })
  }) as typeof fetch
  expect((await getChatGPTModels()).models[0].id).toBe('new-model')
  await getChatGPTModels()
  expect(requests).toBe(1)
  globalThis.fetch = (async () => {
    throw new Error('network unavailable')
  }) as typeof fetch
  expect(await getChatGPTModels(true)).toMatchObject({
    stale: true,
    models: [{ id: 'new-model' }]
  })
  secrets.set(KEY, {
    active: 'issued-b',
    registrations: {
      'issued-b': {
        clientId: 'issued-b',
        subject: 'user-b',
        tokens: {
          accessToken: 'other',
          clientId: 'issued-b',
          subject: 'user-b',
          scopes: scopes.split(' '),
          expiresAt: Date.now() + 3600_000
        }
      }
    }
  })
  expect((await getChatGPTModels()).models).toEqual([])
})

test('an offline refresh keeps the cached model catalog available', async () => {
  seed({ expiresAt: 1 })
  local.set('chatgpt-models:issued-a', {
    models: [{ id: 'cached-model', label: 'Cached' }],
    stale: false,
    fetchedAt: Date.now() - 7 * 3600_000,
    registrationId: 'issued-a'
  })
  exchange = async () => {
    throw new TypeError('Network unavailable')
  }
  expect(await getChatGPTModels()).toMatchObject({
    stale: true,
    models: [{ id: 'cached-model' }]
  })
})

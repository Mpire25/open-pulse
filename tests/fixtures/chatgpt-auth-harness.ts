import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import { TokenExchangeError, validateCallback as validateRealCallback } from '../../src/main/chatgpt-protocol'
import type { CodexTokens } from '../../src/main/codex-auth'
const originalFetch = globalThis.fetch
const secrets = new Map<string, unknown>(),
  local = new Map<string, unknown>()
let exchange: (body: URLSearchParams) => Promise<unknown>
let subject = 'user-a',
  scopes = 'chatgpt.tokens.use.direct offline_access'
let callbackFailure = false
let omitClientId = false
let differentClient = false
let authorizationRequests: URLSearchParams[] = []
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
      authorizationRequests.push(new URLSearchParams(authorization.search))
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      expect(callback.hostname).toBe('127.0.0.1')
      expect(callback.port).not.toBe('1455')
      callback.search = new URLSearchParams({
        state: callbackFailure
          ? 'wrong'
          : authorization.searchParams.get('state')!,
        code: 'test-code',
        ...(omitClientId ? {} : { client_id: differentClient ? 'issued-b' :
          authorization.searchParams.get('client_id') === 'dynamic_agent_client'
            ? 'issued-a'
            : authorization.searchParams.get('client_id')! })
      }).toString()
      const response = await originalFetch(callback)
      expect(response.status).toBe((callbackFailure || differentClient) ? 400 : 200)
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(response.headers.get('cache-control')).toBe('no-store')
      const page = await response.text()
      expect(page).toContain((callbackFailure || differentClient) ? 'Sign-in interrupted' : 'Authorization received')
      expect(page).toContain('Return to OpenPulse')
      expect(page).not.toContain(callback.searchParams.get('state')!)
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
  validateCallback: validateRealCallback,
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
const KEY = 'chatgpt-plan-session'
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
  secrets.set(KEY, tokens)
}
beforeEach(() => {
  secrets.clear()
  local.clear()
  subject = 'user-a'
  scopes = 'chatgpt.tokens.use.direct offline_access'
  callbackFailure = false
  omitClientId = false
  differentClient = false
  authorizationRequests = []
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
  await expect(auth.connectCodex()).rejects.toThrow('state')
  expect(exchanges).toBe(0)
  expect((await auth.getCodexTokens())?.accessToken).toBe('test-access')
})
test('returning sign-in cannot overwrite the single registration with another identity', async () => {
  seed()
  subject = 'other-user'
  const revoked: URLSearchParams[] = []
  globalThis.fetch = (async (_input, init) => {
    revoked.push(new URLSearchParams(String(init?.body)))
    return new Response('', { status: 200 })
  }) as typeof fetch
  await expect(auth.connectCodex()).rejects.toThrow('different identity')
  expect(revoked.map((body) => Object.fromEntries(body))).toEqual([{ token: 'new-refresh', token_type_hint: 'refresh_token', client_id: 'issued-a' }])
  expect((await auth.getCodexTokens())?.subject).toBe('user-a')
})
test('sign-out during token exchange revokes both the old and discarded sessions', async () => {
  seed()
  const revoked: string[] = []
  globalThis.fetch = (async (_input, init) => {
    revoked.push(new URLSearchParams(String(init?.body)).get('token')!)
    return new Response('', { status: 200 })
  }) as typeof fetch
  exchange = async () => {
    await auth.disconnectCodex()
    return { access_token: 'discarded-access', refresh_token: 'discarded-refresh', id_token: 'discarded-id', expires_in: 3600, scope: scopes, token_type: 'Bearer' }
  }
  await expect(auth.connectCodex()).rejects.toThrow('cancelled')
  expect(revoked).toEqual(['test-refresh', 'discarded-refresh'])
  expect(auth.getCodexStatus().signedIn).toBe(false)
})
test('an invalid token response without a renewable session revokes its access token', async () => {
  const revoked: URLSearchParams[] = []
  globalThis.fetch = (async (_input, init) => {
    revoked.push(new URLSearchParams(String(init?.body)))
    return new Response('', { status: 200 })
  }) as typeof fetch
  exchange = async () => ({ access_token: 'discarded-access', expires_in: 3600, scope: scopes, token_type: 'Bearer' })
  await expect(auth.connectCodex()).rejects.toThrow('did not return an ID token')
  expect(revoked.map((body) => Object.fromEntries(body))).toEqual([{ token: 'discarded-access', token_type_hint: 'access_token', client_id: 'issued-a' }])
  expect(auth.getCodexStatus().signedIn).toBe(false)
})
test('discarded-token revocation failures are disclosed without replacing the saved session', async () => {
  seed()
  subject = 'other-user'
  globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch
  await expect(auth.connectCodex()).rejects.toThrow('Remote revocation was not confirmed')
  expect((await auth.getCodexTokens())?.subject).toBe('user-a')
})
test('a changed callback client ID is rejected before token exchange', async () => {
  seed()
  differentClient = true
  await expect(auth.connectCodex()).rejects.toThrow('registration changed')
  expect(exchanges).toBe(0)
  expect((await auth.getCodexTokens())?.accessToken).toBe('test-access')
})
test('old registration storage migrates only the active session', async () => {
  seed()
  const active = secrets.get(KEY)
  secrets.delete(KEY)
  secrets.set('chatgpt-plan-registrations', {
    active: 'issued-a',
    registrations: {
      'issued-a': { tokens: active },
      'issued-b': { tokens: { ...(active as CodexTokens), clientId: 'issued-b', subject: 'other-user' } }
    }
  })
  expect((await auth.getCodexTokens())?.subject).toBe('user-a')
  expect(secrets.has('chatgpt-plan-registrations')).toBe(false)
  expect((secrets.get(KEY) as { tokens: unknown }).tokens).toEqual(active)
  expect('accounts' in auth.getCodexStatus()).toBe(false)
})
test('new sign-in removes old registrations so sign-out cannot restore them', async () => {
  seed()
  const previous = secrets.get(KEY)
  secrets.delete(KEY)
  secrets.set('chatgpt-plan-registrations', { active: 'old', registrations: { old: { tokens: previous } } })
  await auth.connectCodex()
  expect(secrets.has('chatgpt-plan-registrations')).toBe(false)
  globalThis.fetch = (async () => new Response('', { status: 200 })) as typeof fetch
  await auth.disconnectCodex()
  expect(auth.getCodexStatus().signedIn).toBe(false)
  expect(secrets.has(KEY)).toBe(false)
})
test('missing plan consent retains identity without enabling inference', async () => {
  scopes = 'openid email offline_access'
  expect(await auth.connectCodex()).toMatchObject({
    signedIn: true,
    connected: false,
    planEnabled: false
  })
  await expect(auth.getCodexTokens()).rejects.toThrow(
    'Sign out and sign in again'
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
  expect((secrets.get(KEY) as { tokens?: unknown }).tokens).toBeUndefined()
})
test('disconnect revokes and clears the single connection', async () => {
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
    signedIn: false
  })
  expect(secrets.has(KEY)).toBe(false)
  expect(auth.getCodexStatus().activeRegistration).toBeUndefined()
})
test('sign-out allows the same or a different account through fresh registration', async () => {
  await auth.connectCodex()
  const hostId = authorizationRequests[0].get('ext_agent_host_id')
  globalThis.fetch = (async () => new Response('', { status: 200 })) as typeof fetch
  await auth.disconnectCodex()
  expect(secrets.has(KEY)).toBe(false)
  expect(auth.getCodexStatus().signedIn).toBe(false)
  expect(await auth.connectCodex()).toMatchObject({ connected: true })
  await auth.disconnectCodex()
  subject = 'other-user'
  expect(await auth.connectCodex()).toMatchObject({ connected: true })
  expect((await auth.getCodexTokens())?.subject).toBe('other-user')
  for (const request of authorizationRequests) {
    expect(request.get('client_id')).toBe('dynamic_agent_client')
    expect(request.get('agent_name_hint')).toBe('OpenPulse')
    expect(request.get('ext_agent_host_id')).toBe(hostId)
  }
  expect(authorizationRequests[1].get('state')).not.toBe(authorizationRequests[0].get('state'))
})
test('old signed-out registrations do not bind the next sign-in', async () => {
  secrets.set(KEY, { clientId: 'removed-client', subject: 'previous-user' })
  subject = 'other-user'
  expect(await auth.connectCodex()).toMatchObject({ connected: true })
  expect(authorizationRequests[0].get('client_id')).toBe('dynamic_agent_client')
})
test('returning sign-in with a saved session reuses its registration and accepts omitted client_id', async () => {
  seed()
  omitClientId = true
  expect(await auth.connectCodex()).toMatchObject({ connected: true })
  expect(authorizationRequests[0].get('client_id')).toBe('issued-a')
  expect(authorizationRequests[0].has('agent_name_hint')).toBe(false)
})
test('declined plan consent requests consent for the saved session', async () => {
  scopes = 'openid email offline_access'
  await auth.connectCodex()
  scopes += ' chatgpt.tokens.use.direct'
  expect(await auth.connectCodex()).toMatchObject({ connected: true })
  expect(authorizationRequests[1].get('prompt')).toBe('consent')
  expect(authorizationRequests[1].get('client_id')).toBe('issued-a')
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
    { id: 'future-model', label: 'Future', efforts: ['low', 'new-tier'] },
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
  seed({ clientId: 'issued-b', subject: 'user-b', accessToken: 'other' })
  expect((await getChatGPTModels()).models).toEqual([])
})

test('older catalogs refresh to recover new effort levels and remove synthetic Automatic', async () => {
  seed()
  local.set('chatgpt-models:issued-a', {
    models: [{ id: 'future-model', label: 'Future', efforts: ['auto', 'max'] }],
    fetchedAt: Date.now(), stale: false, registrationId: 'issued-a', effortsVersion: 1
  })
  let requests = 0
  globalThis.fetch = (async () => {
    requests++
    return Response.json({ models: [{ slug: 'future-model', visibility: 'list', supported_reasoning_levels: ['max', 'ultra'] }] })
  }) as typeof fetch
  expect(await getChatGPTModels()).toMatchObject({
    effortsVersion: 2, models: [{ id: 'future-model', efforts: ['max', 'ultra'] }]
  })
  await getChatGPTModels()
  expect(requests).toBe(1)
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

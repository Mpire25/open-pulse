import { afterEach, beforeEach, expect, mock, test } from 'bun:test'
import * as http from 'node:http'
import type { AddressInfo } from 'node:net'
const originalFetch = globalThis.fetch
const secrets = new Map<string, unknown>()
let scenario: 'success' | 'denied' | 'missing-code' = 'success'
let exchanges = 0
let pages: { status: number; headers: Headers; body: string }[] = []
let callbacks: Promise<void> = Promise.resolve()
let server: http.Server

// Listen on a free port instead of the fixed redirect port, so a running OpenPulse can't collide.
const realCreateServer = http.createServer
mock.module('node:http', () => ({
  ...http,
  createServer: (...args: Parameters<typeof http.createServer>) => {
    server = realCreateServer(...args)
    const listen = server.listen.bind(server) as (...rest: unknown[]) => http.Server
    server.listen = ((_port: number, ...rest: unknown[]) => listen(0, ...rest)) as typeof server.listen
    return server
  }
}))

async function hit(url: URL, method = 'GET'): Promise<void> {
  const response = await originalFetch(url, { method })
  pages.push({ status: response.status, headers: response.headers, body: await response.text() })
}

mock.module('electron', () => ({
  shell: {
    openExternal: (url: string) => (callbacks = sendCallbacks(url))
  }
}))

async function sendCallbacks(url: string): Promise<void> {
  const authorization = new URL(url)
  const state = authorization.searchParams.get('state')!
  const callback = new URL(authorization.searchParams.get('redirect_uri')!)
  callback.port = String((server.address() as AddressInfo).port)
  // Stray requests on the fixed port must not settle the sign-in.
  callback.search = new URLSearchParams({ state: 'foreign', code: 'stray-code' }).toString()
  await hit(callback)
  callback.search = new URLSearchParams({ state }).toString()
  await hit(callback, 'HEAD')
  callback.search = new URLSearchParams(
    scenario === 'denied'
      ? { state, error: 'access_denied' }
      : scenario === 'missing-code'
        ? { state }
        : { state, code: 'test-code' }
  ).toString()
  await hit(callback)
}
mock.module('../../src/main/store', () => ({
  getSecret: (key: string) => structuredClone(secrets.get(key) ?? null),
  setSecret: (key: string, value: unknown) => secrets.set(key, structuredClone(value)),
  deleteSecret: (key: string) => secrets.delete(key),
  getSettings: () => ({ googleClientId: 'test-client' }),
  getGoogleClientSecret: () => 'test-secret'
}))
const auth = await import('../../src/main/google-auth')

function expectPage(page: (typeof pages)[number], status: number, text: string): void {
  expect(page.status).toBe(status)
  expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
  expect(page.headers.get('cache-control')).toBe('no-store')
  expect(page.headers.get('content-security-policy')).toContain("default-src 'none'")
  expect(page.body).toContain(text)
}

beforeEach(() => {
  secrets.clear()
  scenario = 'success'
  exchanges = 0
  pages = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.origin !== 'https://oauth2.googleapis.com') return originalFetch(input, init)
    exchanges++
    expect(new URLSearchParams(String(init?.body)).get('code')).toBe('test-code')
    return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 })
  }) as typeof fetch
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

test('successful callback shows the themed page after ignoring stray requests', async () => {
  expect(await auth.connectGoogle()).toMatchObject({ connected: true })
  await callbacks
  expect(exchanges).toBe(1)
  expect(pages).toHaveLength(3)
  expectPage(pages[0], 400, 'Sign-in interrupted')
  expect(pages[1].status).toBe(404)
  expectPage(pages[2], 200, 'Authorization received')
  expect(pages[2].body).toContain('Google Health')
  expect(pages[2].body).not.toContain('test-code')
})

test('denied consent shows the failure page and never exchanges tokens', async () => {
  scenario = 'denied'
  await expect(auth.connectGoogle()).rejects.toThrow('access_denied')
  await callbacks
  expect(exchanges).toBe(0)
  expectPage(pages[2], 400, 'Sign-in interrupted')
})

test('callback without a code shows the failure page', async () => {
  scenario = 'missing-code'
  await expect(auth.connectGoogle()).rejects.toThrow('authorization code')
  await callbacks
  expect(exchanges).toBe(0)
  expectPage(pages[2], 400, 'Sign-in interrupted')
})

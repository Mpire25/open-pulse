// ChatGPT plan OAuth. Credentials never cross the renderer IPC boundary.
import { shell } from 'electron'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createPkcePair, randomState } from './pkce'
import { chatGPTCallbackPage, CHATGPT_CALLBACK_HEADERS } from './chatgpt-callback-page'
import {
  createSharedOperation,
  waitForSharedOperation,
  type SharedOperation
} from './shared-operation'
import {
  deleteSecret,
  getSecret,
  setSecret,
  hasSecret,
  getLocalValue,
  setLocalValue
} from './store'
import type { CodexAuthStatus } from '../shared/types'
import {
  CHATGPT_ISSUER,
  CHATGPT_RESOURCE,
  CHATGPT_SCOPE,
  PLAN_SCOPE,
  validateCallback,
  verifyIdentity,
  exchangeToken,
  unusableRefresh,
  getDiscovery
} from './chatgpt-protocol'

const SECRET_KEY = 'chatgpt-plan-session'
const LEGACY_REGISTRATIONS_KEY = 'chatgpt-plan-registrations'
export interface CodexTokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  clientId: string
  subject: string
  email?: string
  scopes: string[]
  expiresAt: number
  accountId?: string
}
let authGeneration = 0
let disconnectGeneration: number | undefined
let activeConnectReject: ((error: Error) => void) | null = null
let refreshRequest: SharedOperation<CodexTokens | null> | undefined
function read(): CodexTokens | null {
  const tokens = getSecret<CodexTokens>(SECRET_KEY)
  if (!hasSecret(LEGACY_REGISTRATIONS_KEY)) return tokens
  if (tokens) {
    deleteSecret(LEGACY_REGISTRATIONS_KEY)
    return tokens
  }
  // Keep only the active session from the previous storage format.
  const legacy = getSecret<{ active?: string; registrations: Record<string, { tokens?: CodexTokens }> }>(LEGACY_REGISTRATIONS_KEY)
  const active = legacy?.active ? legacy.registrations[legacy.active]?.tokens : undefined
  if (active) setSecret(SECRET_KEY, active)
  deleteSecret(LEGACY_REGISTRATIONS_KEY)
  return active ?? null
}
async function finishRefreshes(): Promise<void> {
  if (refreshRequest) await Promise.allSettled([refreshRequest.promise])
}
export function getCodexAuthGeneration(): number {
  return authGeneration
}
export function isCodexAuthGenerationCurrent(generation: number): boolean {
  return generation === authGeneration
}
function assertCurrent(generation: number): void {
  if (!isCodexAuthGenerationCurrent(generation))
    throw new Error('ChatGPT sign-in was cancelled.')
}
export function getCodexStatus(): CodexAuthStatus {
  const tokens = read()
  const planEnabled =
    disconnectGeneration !== authGeneration &&
    Boolean(tokens?.scopes.includes(PLAN_SCOPE))
  return {
    connected: planEnabled,
    signedIn: Boolean(tokens),
    planEnabled,
    email: tokens?.email,
    activeRegistration: tokens?.clientId,
    authRevision: authGeneration,
    needsReconnect: !tokens && hasSecret('codex-tokens')
  }
}

export async function disconnectCodex(): Promise<{ warning?: string }> {
  const generation = ++authGeneration
  disconnectGeneration = generation
  activeConnectReject?.(new Error('ChatGPT sign-in was cancelled.'))
  await finishRefreshes()
  assertCurrent(generation)
  const tokens = read()
  let warning: string | undefined
  if (tokens?.refreshToken) {
    try {
      const discovery = await getDiscovery()
      const response = await fetch(discovery.revocation_endpoint, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: tokens.refreshToken,
          token_type_hint: 'refresh_token',
          client_id: tokens.clientId
        })
      })
      if (!response.ok) throw new Error('Revocation failed.')
    } catch {
      warning =
        'Signed out locally. Remote revocation was not confirmed; you can disconnect OpenPulse in ChatGPT Settings.'
    }
  }
  // Re-read so a concurrent sign-in cannot be overwritten.
  const current = read()
  if (
    isCodexAuthGenerationCurrent(generation) &&
    tokens && current?.accessToken === tokens.accessToken &&
    current.clientId === tokens.clientId
  ) {
    deleteSecret(SECRET_KEY)
  }
  if (isCodexAuthGenerationCurrent(generation)) disconnectGeneration = undefined
  return { warning }
}

export async function connectCodex(): Promise<CodexAuthStatus> {
  activeConnectReject?.(new Error('ChatGPT sign-in was restarted.'))
  const generation = ++authGeneration
  await finishRefreshes()
  assertCurrent(generation)
  let hostId = getLocalValue<string>('chatgpt-host-id')
  if (!hostId) {
    hostId = `urn:uuid:${randomUUID()}`
    setLocalValue('chatgpt-host-id', hostId)
  }
  const { verifier, challenge } = createPkcePair()
  const state = randomState(),
    nonce = randomState()
  let redirectUri = ''
  const callback = await new Promise<{ code: string; clientId: string }>(
    (resolve, reject) => {
      let settled = false
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', redirectUri)
        if (req.method !== 'GET' || url.pathname !== '/auth/callback') {
          res.writeHead(404).end()
          return
        }
        try {
          const value = validateCallback(
            url.searchParams,
            state
          )
          res
            .writeHead(200, CHATGPT_CALLBACK_HEADERS)
            .end(chatGPTCallbackPage('received'))
          finish()
          resolve(value)
        } catch (error) {
          res.writeHead(400, CHATGPT_CALLBACK_HEADERS).end(chatGPTCallbackPage('failed'))
          fail(
            error instanceof Error ? error : new Error('Authorization failed.')
          )
        }
      })
      const timer = setTimeout(
        () => fail(new Error('Timed out waiting for ChatGPT sign-in.')),
        5 * 60_000
      )
      function finish(): void {
        settled = true
        clearTimeout(timer)
        server.close()
        if (activeConnectReject === fail) activeConnectReject = null
      }
      function fail(error: Error): void {
        if (settled) return
        finish()
        reject(error)
      }
      activeConnectReject = fail
      server.on('error', fail)
      server.listen(0, '127.0.0.1', () => {
        if (settled) {
          server.close()
          return
        }
        const address = server.address()
        if (!address || typeof address === 'string') {
          fail(new Error('Could not start sign-in callback.'))
          return
        }
        redirectUri = `http://127.0.0.1:${address.port}/auth/callback`
        const url = new URL(`${CHATGPT_ISSUER}/api/accounts/authorize`)
        url.search = new URLSearchParams({
          client_id: 'dynamic_agent_client',
          agent_name_hint: 'OpenPulse',
          ext_agent_host_id: hostId!,
          response_type: 'code',
          redirect_uri: redirectUri,
          scope: CHATGPT_SCOPE,
          resource: CHATGPT_RESOURCE,
          state,
          nonce,
          code_challenge_method: 'S256',
          code_challenge: challenge
        }).toString()
        void shell
          .openExternal(url.toString())
          .catch(() => fail(new Error('Could not open the sign-in browser.')))
      })
    }
  )
  assertCurrent(generation)
  const response = await exchangeToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: callback.clientId,
      code: callback.code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: CHATGPT_RESOURCE
    })
  )
  if (!response.id_token) throw new Error('ChatGPT did not return an ID token.')
  const identity = await verifyIdentity(
    response.id_token,
    callback.clientId,
    nonce
  )
  assertCurrent(generation)
  const tokens: CodexTokens = {
    clientId: callback.clientId,
    subject: identity.subject,
    email: identity.email,
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    idToken: response.id_token,
    scopes: response.scope.split(/\s+/),
    expiresAt: Date.now() + response.expires_in * 1000
  }
  setSecret(SECRET_KEY, tokens)
  deleteSecret(LEGACY_REGISTRATIONS_KEY)
  deleteSecret('codex-tokens')
  return getCodexStatus()
}

export async function getCodexTokens(
  signal?: AbortSignal
): Promise<CodexTokens | null> {
  const generation = authGeneration
  if (disconnectGeneration === generation) return null
  const tokens = read()
  if (!tokens) return null
  if (!tokens.scopes.includes(PLAN_SCOPE))
    throw new Error(
      'Sign out and sign in again to authorize ChatGPT plan usage.'
    )
  if (Date.now() < tokens.expiresAt - 5 * 60_000) return tokens
  if (!tokens.refreshToken)
    throw new Error('ChatGPT session expired. Reconnect in Settings.')
  let operation = refreshRequest
  if (!operation) {
    // Token rotation completes even when its last chat consumer cancels.
    operation = createSharedOperation<CodexTokens | null>(() =>
      refreshTokens(tokens)
    )
    refreshRequest = operation
    const current = operation
    const clear = (): void => {
      if (refreshRequest === current) refreshRequest = undefined
    }
    operation.promise.then(clear, clear)
  }
  const updated = await waitForSharedOperation(operation, signal)
  return isCodexAuthGenerationCurrent(generation) ? updated : null
}

async function refreshTokens(tokens: CodexTokens): Promise<CodexTokens | null> {
  try {
    const response = await exchangeToken(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: tokens.clientId,
        refresh_token: tokens.refreshToken!,
        resource: CHATGPT_RESOURCE
      })
    )
    if (response.id_token) {
      const identity = await verifyIdentity(response.id_token, tokens.clientId)
      if (identity.subject !== tokens.subject)
        throw new Error('Refreshed ChatGPT identity mismatch.')
    }
    const data = read()
    if (!data || data.refreshToken !== tokens.refreshToken || data.clientId !== tokens.clientId)
      return null
    const updated: CodexTokens = {
      ...tokens,
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? tokens.refreshToken,
      idToken: response.id_token ?? tokens.idToken,
      scopes: response.scope.split(/\s+/),
      expiresAt: Date.now() + response.expires_in * 1000
    }
    setSecret(SECRET_KEY, updated)
    if (!updated.scopes.includes(PLAN_SCOPE))
      throw new Error(
        'ChatGPT plan permission is no longer enabled. Reconnect in Settings.'
      )
    return updated
  } catch (error) {
    if (unusableRefresh(error)) {
      const data = read()
      if (data && data.refreshToken === tokens.refreshToken && data.clientId === tokens.clientId) {
        deleteSecret(SECRET_KEY)
      }
      throw new Error(
        'ChatGPT session is no longer valid. Reconnect in Settings.'
      )
    }
    throw error
  }
}

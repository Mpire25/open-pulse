import { shell } from 'electron'
import { createServer } from 'node:http'
import { createPkcePair, randomState, decodeJwtPayload } from './pkce'
import { googleAccountScope } from './google-account-scope'
import { getSecret, setSecret, deleteSecret, getSettings, getGoogleClientSecret } from './store'
import type { GoogleAuthStatus } from '../shared/types'

// Google Health API scopes (from the v4 discovery document) plus identity.
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.location.readonly',
  'https://www.googleapis.com/auth/googlehealth.nutrition.readonly',
  'https://www.googleapis.com/auth/googlehealth.settings.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly'
]

interface GoogleTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number // epoch ms
  email?: string
  subject?: string
}

const SECRET_KEY = 'google-tokens'
const GOOGLE_SIGN_IN_TIMEOUT_MS = 60_000
const GOOGLE_REDIRECT_PORT = 42813
const GOOGLE_REDIRECT_PATH = '/oauth/callback'
const GOOGLE_REDIRECT_URI = `http://127.0.0.1:${GOOGLE_REDIRECT_PORT}${GOOGLE_REDIRECT_PATH}`

const LANDING_HTML = `<!doctype html><meta charset="utf-8"><title>OpenPulse</title>
<body style="font-family:-apple-system,system-ui;background:#0a0a0c;color:#f5f5f7;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2 style="font-weight:600">Connected to Google Health</h2>
<p style="color:#a1a1a8">You can close this window and return to OpenPulse.</p></div></body>`

let activeConnectReject: ((err: Error) => void) | null = null
let authGeneration = 0
let refreshRequest: { generation: number; controller: AbortController; promise: Promise<string> } | null = null
let refreshRetryAfter = 0
const REFRESH_FAILURE_COOLDOWN_MS = 30_000

export class GoogleAuthUnavailableError extends Error {
  constructor(message: string, readonly disconnected = false) {
    super(message)
    this.name = 'GoogleAuthUnavailableError'
  }
}

function cancelRefresh(): void {
  refreshRequest?.controller.abort()
  refreshRequest = null
  refreshRetryAfter = 0
}

interface GoogleTokenError {
  error?: string
  error_description?: string
}

export function getGoogleStatus(): GoogleAuthStatus {
  const tokens = getSecret<GoogleTokens>(SECRET_KEY)
  return tokens ? { connected: true, email: tokens.email } : { connected: false }
}

export function getGoogleAccountScope(): string {
  return googleAccountScope(getSecret<GoogleTokens>(SECRET_KEY))
}

export function disconnectGoogle(): void {
  cancelRefresh()
  authGeneration += 1
  activeConnectReject?.(new Error('Google sign-in was cancelled.'))
  deleteSecret(SECRET_KEY)
}

/**
 * Runs the OAuth 2.0 authorization-code + PKCE flow for a Google "Web application"
 * client using a fixed loopback redirect.
 */
export async function connectGoogle(): Promise<GoogleAuthStatus> {
  const clientId = getSettings().googleClientId.trim()
  const clientSecret = getGoogleClientSecret()
  if (!clientId) {
    throw new Error(
      'No Google OAuth Client ID configured. Create a "Web application" OAuth client in Google Cloud Console, register http://127.0.0.1:42813/oauth/callback as its redirect URI, then paste its Client ID and Client Secret here.'
    )
  }
  if (!clientSecret) {
    throw new Error('No Google OAuth Client Secret configured. Paste the Client Secret from the same Web application OAuth client as the Client ID.')
  }

  cancelRefresh()
  const generation = ++authGeneration
  const { verifier, challenge } = createPkcePair()
  const state = randomState()

  activeConnectReject?.(new Error('Google sign-in was restarted.'))

  const code = await new Promise<string>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== GOOGLE_REDIRECT_PATH) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(LANDING_HTML)
      const err = url.searchParams.get('error')
      const returnedState = url.searchParams.get('state')
      const authCode = url.searchParams.get('code')
      if (err) settleReject(new Error(`Google sign-in failed: ${err}`))
      else if (returnedState !== state) settleReject(new Error('OAuth state mismatch.'))
      else if (!authCode) settleReject(new Error('Google did not return an authorization code.'))
      else settleResolve(authCode)
    })

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (server.listening) server.close()
      if (activeConnectReject === settleReject) activeConnectReject = null
    }

    const settleResolve = (value: string): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    function settleReject(err: Error): void {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    activeConnectReject = settleReject
    server.on('error', (err) => {
      const message =
        'Could not start the Google callback listener on http://127.0.0.1:42813/oauth/callback. Close any other OpenPulse/OpenFit process using that port, then try again.'
      settleReject(err instanceof Error && 'code' in err && err.code === 'EADDRINUSE' ? new Error(message) : err)
    })

    timer = setTimeout(
      () => {
        settleReject(new Error('Timed out waiting for Google sign-in. Check the Client ID, then try again.'))
      },
      GOOGLE_SIGN_IN_TIMEOUT_MS
    )
    server.listen(GOOGLE_REDIRECT_PORT, '127.0.0.1', () => {
      if (settled) {
        server.close()
        return
      }
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'consent'
      }).toString()
      void shell.openExternal(authUrl.toString())
    })
  })

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: GOOGLE_REDIRECT_URI
  })
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  assertCurrentGeneration(generation)
  if (!resp.ok) {
    throw new Error(await formatGoogleTokenError(resp))
  }
  const json = (await resp.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    id_token?: string
  }
  assertCurrentGeneration(generation)
  const claims = json.id_token ? decodeJwtPayload<{ email?: string; sub?: string }>(json.id_token) : null
  const tokens: GoogleTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    email: claims?.email,
    subject: claims?.sub
  }
  setSecret(SECRET_KEY, tokens)
  refreshRetryAfter = 0
  return { connected: true, email: tokens.email }
}

function assertCurrentGeneration(generation: number): void {
  if (generation !== authGeneration) throw new Error('Google sign-in was cancelled.')
}

async function formatGoogleTokenError(resp: Response): Promise<string> {
  const text = await resp.text()
  let payload: GoogleTokenError | null = null

  try {
    payload = JSON.parse(text) as GoogleTokenError
  } catch {
    // Keep the raw response below when Google returns something unexpected.
  }

  const description = payload?.error_description ?? ''
  if (payload?.error === 'invalid_request' && description.includes('client_secret')) {
    return (
      'This Google OAuth Client ID expects a client secret. Paste the Client Secret from the same Web application OAuth client, then try again.'
    )
  }

  const detail = description || payload?.error || text
  return `Google token exchange failed (${resp.status}): ${detail}`
}

/** Returns a valid access token, null when disconnected, or throws when a connected session is unavailable. */
export async function getGoogleAccessToken(): Promise<string | null> {
  const generation = authGeneration
  const tokens = getSecret<GoogleTokens>(SECRET_KEY)
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken
  if (!tokens.refreshToken) {
    throw new GoogleAuthUnavailableError('Google Health needs to be reconnected before data can sync.')
  }
  if (refreshRequest?.generation === generation) return refreshRequest.promise
  if (Date.now() < refreshRetryAfter) {
    throw new GoogleAuthUnavailableError('Google Health could not refresh its session. Try syncing again shortly.')
  }

  const clientSecret = getGoogleClientSecret()
  if (!clientSecret) {
    throw new GoogleAuthUnavailableError('The Google OAuth client secret is missing. Add it in Settings, then reconnect.')
  }
  const body = new URLSearchParams({
    client_id: getSettings().googleClientId.trim(),
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken
  })
  const controller = new AbortController()
  let promise!: Promise<string>
  promise = fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: controller.signal
  })
    .then(async (resp) => {
      if (generation !== authGeneration) {
        throw new GoogleAuthUnavailableError('Google Health sign-in changed while the session was refreshing.')
      }
      if (!resp.ok) {
        const payload = (await resp.json().catch(() => null)) as GoogleTokenError | null
        if (payload?.error === 'invalid_grant') {
          deleteSecret(SECRET_KEY)
          throw new GoogleAuthUnavailableError(
            'Google Health access expired. Reconnect your account in Settings.',
            true
          )
        }
        refreshRetryAfter = Date.now() + REFRESH_FAILURE_COOLDOWN_MS
        throw new GoogleAuthUnavailableError('Google Health could not refresh its session. Try syncing again shortly.')
      }
      const json = (await resp.json()) as { access_token: string; expires_in: number }
      if (generation !== authGeneration) {
        throw new GoogleAuthUnavailableError('Google Health sign-in changed while the session was refreshing.')
      }
      const current = getSecret<GoogleTokens>(SECRET_KEY)
      if (!current) {
        throw new GoogleAuthUnavailableError('Google Health was disconnected while the session was refreshing.')
      }
      if (
        current.accessToken !== tokens.accessToken ||
        current.refreshToken !== tokens.refreshToken ||
        current.expiresAt !== tokens.expiresAt
      ) {
        return current.accessToken
      }
      const updated: GoogleTokens = {
        ...tokens,
        accessToken: json.access_token,
        expiresAt: Date.now() + json.expires_in * 1000
      }
      setSecret(SECRET_KEY, updated)
      refreshRetryAfter = 0
      return updated.accessToken
    })
    .catch((error) => {
      if (error instanceof GoogleAuthUnavailableError) throw error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GoogleAuthUnavailableError('Google Health session refresh was cancelled.')
      }
      refreshRetryAfter = Date.now() + REFRESH_FAILURE_COOLDOWN_MS
      throw new GoogleAuthUnavailableError('Google Health could not refresh its session. Check your connection and try again.')
    })
    .finally(() => {
      if (refreshRequest?.promise === promise) refreshRequest = null
    })
  refreshRequest = { generation, controller, promise }
  return promise
}

import { shell } from 'electron'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createPkcePair, randomState, decodeJwtPayload } from './pkce'
import { getSecret, setSecret, deleteSecret, getSettings } from './store'
import type { GoogleAuthStatus } from '../shared/types'

// Google Health API scopes (from the v4 discovery document) plus identity.
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.profile.readonly'
]

interface GoogleTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number // epoch ms
  email?: string
}

const SECRET_KEY = 'google-tokens'
const GOOGLE_SIGN_IN_TIMEOUT_MS = 60_000

const LANDING_HTML = `<!doctype html><meta charset="utf-8"><title>OpenPulse</title>
<body style="font-family:-apple-system,system-ui;background:#0a0a0c;color:#f5f5f7;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2 style="font-weight:600">Connected to Google Health</h2>
<p style="color:#a1a1a8">You can close this window and return to OpenPulse.</p></div></body>`

let activeConnectReject: ((err: Error) => void) | null = null

export function getGoogleStatus(): GoogleAuthStatus {
  const tokens = getSecret<GoogleTokens>(SECRET_KEY)
  return tokens ? { connected: true, email: tokens.email } : { connected: false }
}

export function disconnectGoogle(): void {
  deleteSecret(SECRET_KEY)
}

/**
 * Runs the OAuth 2.0 authorization-code + PKCE flow for a Google "Desktop app"
 * client using a loopback redirect, per Google's native-app guidance.
 */
export async function connectGoogle(): Promise<GoogleAuthStatus> {
  const clientId = getSettings().googleClientId.trim()
  if (!clientId) {
    throw new Error(
      'No Google OAuth Client ID configured. Create a "Desktop app" OAuth client in Google Cloud Console (with the Health API enabled) and paste its Client ID in Settings.'
    )
  }

  const { verifier, challenge } = createPkcePair()
  const state = randomState()

  activeConnectReject?.(new Error('Google sign-in was restarted.'))

  const { code, redirectPort } = await new Promise<{ code: string; redirectPort: number }>((resolve, reject) => {
    let settled = false
    let redirectPort = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/oauth2callback') {
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
      else settleResolve({ code: authCode, redirectPort })
    })

    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (server.listening) server.close()
      if (activeConnectReject === settleReject) activeConnectReject = null
    }

    const settleResolve = (value: { code: string; redirectPort: number }): void => {
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
    server.on('error', settleReject)

    timer = setTimeout(
      () => {
        settleReject(new Error('Timed out waiting for Google sign-in. Check the Client ID, then try again.'))
      },
      GOOGLE_SIGN_IN_TIMEOUT_MS
    )
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      redirectPort = port
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}/oauth2callback`,
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
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: `http://127.0.0.1:${redirectPort}/oauth2callback`
  })
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!resp.ok) {
    throw new Error(`Google token exchange failed (${resp.status}): ${await resp.text()}`)
  }
  const json = (await resp.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    id_token?: string
  }
  const claims = json.id_token ? decodeJwtPayload<{ email?: string }>(json.id_token) : null
  const tokens: GoogleTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
    email: claims?.email
  }
  setSecret(SECRET_KEY, tokens)
  return { connected: true, email: tokens.email }
}

/** Returns a valid access token, refreshing it if needed, or null when not connected. */
export async function getGoogleAccessToken(): Promise<string | null> {
  const tokens = getSecret<GoogleTokens>(SECRET_KEY)
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken
  if (!tokens.refreshToken) return null

  const body = new URLSearchParams({
    client_id: getSettings().googleClientId.trim(),
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken
  })
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!resp.ok) return null
  const json = (await resp.json()) as { access_token: string; expires_in: number }
  const updated: GoogleTokens = {
    ...tokens,
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000
  }
  setSecret(SECRET_KEY, updated)
  return updated.accessToken
}

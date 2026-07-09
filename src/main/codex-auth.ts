// "Sign in with ChatGPT" — the OAuth 2.0 authorization-code + PKCE flow used
// by OpenAI Codex (https://developers.openai.com/codex/auth). Uses the public
// Codex client ID and the fixed localhost:1455 callback that client permits.

import { shell } from 'electron'
import { createServer } from 'node:http'
import { createPkcePair, randomState, decodeJwtPayload } from './pkce'
import { deleteSecret, getSecret, setSecret } from './store'
import type { CodexAuthStatus } from '../shared/types'

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const ISSUER = 'https://auth.openai.com'
const REDIRECT_URI = 'http://localhost:1455/auth/callback'
const SECRET_KEY = 'codex-tokens'

export interface CodexTokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  accountId?: string
  email?: string
  planType?: string
  expiresAt: number
}

interface AuthClaims {
  email?: string
  'https://api.openai.com/auth'?: {
    chatgpt_account_id?: string
    chatgpt_plan_type?: string
  }
}

const LANDING_HTML = `<!doctype html><meta charset="utf-8"><title>OpenPulse</title>
<body style="font-family:-apple-system,system-ui;background:#0a0a0c;color:#f5f5f7;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><h2 style="font-weight:600">Signed in with ChatGPT</h2>
<p style="color:#a1a1a8">You can close this window and return to OpenPulse.</p></div></body>`

export function getCodexStatus(): CodexAuthStatus {
  const tokens = getSecret<CodexTokens>(SECRET_KEY)
  return tokens
    ? { connected: true, email: tokens.email, planType: tokens.planType }
    : { connected: false }
}

export function disconnectCodex(): void {
  deleteSecret(SECRET_KEY)
}

export async function connectCodex(): Promise<CodexAuthStatus> {
  const { verifier, challenge } = createPkcePair()
  const state = randomState()

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost:1455')
      if (url.pathname !== '/auth/callback') {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(LANDING_HTML)
      server.close()
      clearTimeout(timer)
      const err = url.searchParams.get('error')
      const returnedState = url.searchParams.get('state')
      const authCode = url.searchParams.get('code')
      if (err) reject(new Error(`ChatGPT sign-in failed: ${err}`))
      else if (returnedState !== state) reject(new Error('OAuth state mismatch.'))
      else if (!authCode) reject(new Error('ChatGPT did not return an authorization code.'))
      else resolve(authCode)
    })
    const timer = setTimeout(
      () => {
        server.close()
        reject(new Error('Timed out waiting for ChatGPT sign-in.'))
      },
      5 * 60 * 1000
    )
    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(
        err.code === 'EADDRINUSE'
          ? new Error('Port 1455 is in use (is another Codex sign-in running?). Close it and retry.')
          : err
      )
    })
    server.listen(1455, () => {
      const authUrl = new URL(`${ISSUER}/oauth/authorize`)
      authUrl.search = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: 'openid profile email offline_access',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        id_token_add_organizations: 'true',
        codex_cli_simplified_flow: 'true'
      }).toString()
      void shell.openExternal(authUrl.toString())
    })
  })

  const resp = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier
    }).toString()
  })
  if (!resp.ok) {
    throw new Error(`ChatGPT token exchange failed (${resp.status}): ${await resp.text()}`)
  }
  const json = (await resp.json()) as {
    access_token: string
    refresh_token?: string
    id_token?: string
    expires_in?: number
  }

  const idClaims = json.id_token ? decodeJwtPayload<AuthClaims>(json.id_token) : null
  const accessClaims = decodeJwtPayload<AuthClaims>(json.access_token)
  const auth = accessClaims?.['https://api.openai.com/auth'] ?? idClaims?.['https://api.openai.com/auth']

  const tokens: CodexTokens = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    accountId: auth?.chatgpt_account_id,
    email: idClaims?.email,
    planType: auth?.chatgpt_plan_type,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000
  }
  setSecret(SECRET_KEY, tokens)
  return { connected: true, email: tokens.email, planType: tokens.planType }
}

export async function getCodexTokens(): Promise<CodexTokens | null> {
  const tokens = getSecret<CodexTokens>(SECRET_KEY)
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt - 5 * 60_000) return tokens
  if (!tokens.refreshToken) return tokens // let the API call surface expiry

  const resp = await fetch(`${ISSUER}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: tokens.refreshToken,
      scope: 'openid profile email'
    })
  })
  if (!resp.ok) return tokens
  const json = (await resp.json()) as {
    access_token: string
    refresh_token?: string
    id_token?: string
    expires_in?: number
  }
  const updated: CodexTokens = {
    ...tokens,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    idToken: json.id_token ?? tokens.idToken,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000
  }
  setSecret(SECRET_KEY, updated)
  return updated
}

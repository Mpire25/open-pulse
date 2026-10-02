import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export const CHATGPT_ISSUER = 'https://auth.openai.com'
export const CHATGPT_RESOURCE = 'https://api.openai.com/v1'
export const CHATGPT_SCOPE =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct'

interface Discovery {
  issuer: string
  jwks_uri: string
  revocation_endpoint: string
}
let discovery: Promise<Discovery> | undefined
let keys: JWTVerifyGetKey | undefined

export function getDiscovery(): Promise<Discovery> {
  if (!discovery) {
    discovery = fetch(`${CHATGPT_ISSUER}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(15_000)
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`ChatGPT discovery failed (${response.status}).`)
        const value = (await response.json()) as Discovery
        if (value.issuer !== CHATGPT_ISSUER)
          throw new Error('ChatGPT discovery issuer mismatch.')
        for (const endpoint of [value.jwks_uri, value.revocation_endpoint]) {
          if (new URL(endpoint).origin !== CHATGPT_ISSUER)
            throw new Error('Untrusted ChatGPT discovery endpoint.')
        }
        return value
      })
      .catch((error) => {
        discovery = undefined
        throw error
      })
  }
  return discovery
}

export async function verifyIdentity(
  token: string,
  clientId: string,
  nonce?: string,
  key?: JWTVerifyGetKey
): Promise<{ subject: string; email?: string }> {
  if (!key) {
    const config = await getDiscovery()
    keys ??= createRemoteJWKSet(new URL(config.jwks_uri))
    key = keys
  }
  const { payload } = await jwtVerify(token, key, {
    issuer: CHATGPT_ISSUER,
    audience: clientId,
    requiredClaims: ['sub', 'exp', 'iat']
  })
  if (!payload.sub || (nonce !== undefined && payload.nonce !== nonce))
    throw new Error('ChatGPT identity or nonce mismatch.')
  return {
    subject: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined
  }
}

export function validateCallback(
  params: URLSearchParams,
  state: string,
  previousClientId?: string
): { code: string; clientId: string } {
  if (params.get('state') !== state) throw new Error('OAuth state mismatch.')
  if (params.has('error'))
    throw new Error('ChatGPT authorization was declined or failed.')
  const code = params.get('code')
  const issued = params.get('client_id')
  if (previousClientId && issued && issued !== previousClientId)
    throw new Error('ChatGPT registration changed unexpectedly.')
  const clientId = issued ?? previousClientId
  if (!code || !clientId || clientId === 'dynamic_agent_client')
    throw new Error(
      'ChatGPT registration did not return a code and issued client ID.'
    )
  return { code, clientId }
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in: number
  scope: string
  token_type: string
}
export async function exchangeToken(
  body: URLSearchParams,
  signal?: AbortSignal
): Promise<TokenResponse> {
  const response = await fetch(`${CHATGPT_ISSUER}/api/accounts/oauth/token`, {
    method: 'POST',
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!response.ok) {
    const value = (await response.json().catch(() => ({}))) as {
      error?: unknown
    }
    const code =
      typeof value.error === 'string' && /^[a-z_]+$/.test(value.error)
        ? value.error
        : 'unknown'
    throw new TokenExchangeError(response.status, code)
  }
  const value = (await response.json()) as TokenResponse
  if (
    typeof value.access_token !== 'string' ||
    !value.access_token ||
    (value.refresh_token !== undefined &&
      typeof value.refresh_token !== 'string') ||
    (value.id_token !== undefined && typeof value.id_token !== 'string') ||
    !Number.isFinite(value.expires_in) ||
    value.expires_in <= 0 ||
    typeof value.scope !== 'string' ||
    value.token_type?.toLowerCase() !== 'bearer'
  ) {
    throw new Error('ChatGPT returned an invalid token response.')
  }
  return value
}
export class TokenExchangeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`ChatGPT token exchange failed (${status}, ${code}).`)
  }
}
export function unusableRefresh(error: unknown): boolean {
  return (
    error instanceof TokenExchangeError &&
    [
      'invalid_grant',
      'invalid_refresh_token',
      'token_expired',
      'refresh_token_expired',
      'refresh_token_invalidated',
      'refresh_token_reused'
    ].includes(error.code)
  )
}

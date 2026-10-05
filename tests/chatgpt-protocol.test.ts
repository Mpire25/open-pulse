import { expect, test } from 'bun:test'
import { generateKeyPair, SignJWT } from 'jose'
import {
  validateCallback,
  verifyIdentity,
  CHATGPT_ISSUER
} from '../src/main/chatgpt-protocol'
import {
  localToolNamespace,
  reasoningOptions,
  responseEvents,
  responseError
} from '../src/main/chatgpt-responses'

test('OAuth callback binds state, code and issued client to the pending registration', () => {
  expect(
    validateCallback(
      new URLSearchParams({
        state: 'expected',
        code: 'code',
        client_id: 'issued'
      }),
      'expected'
    )
  ).toEqual({ code: 'code', clientId: 'issued' })
  expect(
    validateCallback(
      new URLSearchParams({ state: 'expected', code: 'code' }),
      'expected',
      'saved'
    )
  ).toEqual({ code: 'code', clientId: 'saved' })
  for (const params of [
    { state: 'wrong', code: 'code', client_id: 'issued' },
    {
      state: 'expected',
      error: 'access_denied',
      code: 'code',
      client_id: 'issued'
    },
    { state: 'expected', code: 'code', client_id: 'dynamic_agent_client' },
    { state: 'expected', code: 'code' },
    { state: 'expected', client_id: 'issued' }
  ])
    expect(() =>
      validateCallback(new URLSearchParams(params), 'expected')
    ).toThrow()
  expect(() =>
    validateCallback(
      new URLSearchParams({
        state: 'expected',
        code: 'code',
        client_id: 'other'
      }),
      'expected',
      'saved'
    )
  ).toThrow()
})

test('ID tokens require a valid signature, issuer, audience, expiry and nonce', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const key = async () => publicKey
  const token = await new SignJWT({
    nonce: 'expected',
    email: 'test@example.invalid'
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(CHATGPT_ISSUER)
    .setAudience('issued')
    .setSubject('user')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)
  expect(await verifyIdentity(token, 'issued', 'expected', key)).toEqual({
    subject: 'user',
    email: 'test@example.invalid'
  })
  await expect(
    verifyIdentity(token, 'other', 'expected', key)
  ).rejects.toThrow()
  await expect(verifyIdentity(token, 'issued', 'wrong', key)).rejects.toThrow()
  const other = await generateKeyPair('RS256')
  await expect(
    verifyIdentity(token, 'issued', 'expected', async () => other.publicKey)
  ).rejects.toThrow()
  const expired = await new SignJWT({ nonce: 'expected' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(CHATGPT_ISSUER)
    .setAudience('issued')
    .setSubject('user')
    .setIssuedAt()
    .setExpirationTime(1)
    .sign(privateKey)
  await expect(
    verifyIdentity(expired, 'issued', 'expected', key)
  ).rejects.toThrow()
})

test('missing and legacy effort selections omit the override and local tools are namespaced', () => {
  expect(reasoningOptions({ model: 'future' })).toEqual({})
  expect(
    reasoningOptions({ model: 'future', reasoningEffort: 'auto' })
  ).toEqual({})
  expect(reasoningOptions({ model: 'future', reasoningEffort: 'low' })).toEqual(
    { reasoning: { effort: 'low' } }
  )
  expect(reasoningOptions({ model: 'future', reasoningEffort: 'ultra' })).toEqual(
    { reasoning: { effort: 'ultra' } }
  )
  expect(reasoningOptions({ model: 'future', reasoningEffort: 'new-tier' })).toEqual(
    { reasoning: { effort: 'new-tier' } }
  )
  expect(localToolNamespace([])).toEqual([])
  expect(
    localToolNamespace([{ type: 'function', name: 'health' }])
  ).toMatchObject([
    { type: 'namespace', name: 'openpulse', tools: [{ name: 'health' }] }
  ])
})
async function events(body: string): Promise<unknown[]> {
  const result: unknown[] = []
  for await (const event of responseEvents(new Response(body), () => {}))
    result.push(event)
  return result
}
test('SSE requires terminal completion and handles CRLF and final unterminated frames', async () => {
  expect(
    await events(
      'data: {"type":"response.output_text.delta","delta":"你好"}\r\n\r\ndata: {"type":"response.completed","response":{"status":"completed"}}'
    )
  ).toHaveLength(2)
  await expect(
    events(
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\ndata: [DONE]\n\n'
    )
  ).rejects.toThrow('interrupted')
  await expect(
    events('data: {"type":"response.incomplete"}\n\n')
  ).rejects.toThrow('incomplete')
  await expect(
    events(
      'data: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded"}}}\n\n'
    )
  ).rejects.toThrow('usage limit')
})
test('diagnostics include safe request identifiers without echoing response bodies', () => {
  const error = responseError(
    {
      detail: 'sensitive backend body',
      error: {
        code: 'subscription_sharing_unsupported_capability',
        param: 'tools'
      }
    },
    400,
    'req_123'
  )
  expect(error.message).toContain('req_123')
  expect(error.message).toContain('tools')
  expect(error.message).not.toContain('sensitive')
})

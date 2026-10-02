import type { AssistantSettings } from '../shared/types'
export const RESPONSES_URL = 'https://api.openai.com/v1/responses'
export function reasoningOptions(
  assistant: AssistantSettings
): Record<string, unknown> {
  return assistant.reasoningEffort === 'auto'
    ? {}
    : { reasoning: { effort: assistant.reasoningEffort } }
}
export function localToolNamespace(tools: unknown[]): unknown[] {
  return tools.length
    ? [
        {
          type: 'namespace',
          name: 'openpulse',
          description:
            'OpenPulse local health data, visualizations, and isolated research.',
          tools
        }
      ]
    : []
}

export class ChatGPTRequestError extends Error {
  constructor(
    message: string,
    readonly stopInference: boolean
  ) {
    super(message)
  }
}

export function responseError(
  value: unknown,
  status?: number,
  requestId?: string | null
): Error {
  const body = value as {
    error?: { code?: string; param?: string }
    code?: string
  } | null
  const code = body?.error?.code ?? body?.code
  const messages: Record<string, string> = {
    subscription_sharing_user_not_eligible:
      'This ChatGPT account or workspace is not eligible for plan usage.',
    subscription_sharing_usage_limit_exceeded:
      'ChatGPT usage limit reached. Check your app limits in ChatGPT Settings → Usage.',
    subscription_sharing_usage_unavailable:
      'ChatGPT usage availability could not be checked. Try again later.',
    subscription_sharing_unsupported_capability:
      'This model or ChatGPT plan does not support a requested capability. Try Automatic reasoning or another model.',
    subscription_sharing_route_not_supported:
      'The ChatGPT plan request route is not supported.',
    subscription_sharing_invalid_user:
      'ChatGPT could not validate this session. Reconnect in Settings.',
    chatpass_v2_scope_not_authorized:
      'ChatGPT plan permission is not authorized. Enable plan usage in Settings.',
    chatpass_v2_invalid_authorization_context:
      'ChatGPT authorization is not valid for this request. Reconnect in Settings.'
  }
  const message =
    code && messages[code]
      ? messages[code]
      : status === 401
        ? 'ChatGPT did not accept this session or its plan permission. Reconnect in Settings.'
        : status === 403
          ? 'ChatGPT blocked this request due to account, workspace, or region policy.'
          : status === 503
            ? 'ChatGPT plan routing is temporarily unavailable. Try again later.'
            : status === 400
              ? 'ChatGPT rejected the model, reasoning setting, or request capability. Try Automatic reasoning or another model.'
              : 'ChatGPT could not complete the request.'
  const safe = (s: unknown): string =>
    typeof s === 'string' && /^[\w.:-]{1,120}$/.test(s) ? s : ''
  const details = [
    status,
    safe(code),
    safe(body?.error?.param),
    safe(requestId)
  ]
    .filter(Boolean)
    .join(', ')
  return new ChatGPTRequestError(
    `${message}${details ? ` (${details})` : ''}`,
    status === 401 ||
      status === 403 ||
      status === 429 ||
      Boolean(
        code?.startsWith('subscription_sharing_usage_') ||
        code === 'subscription_sharing_user_not_eligible' ||
        code === 'subscription_sharing_invalid_user' ||
        code?.startsWith('chatpass_v2_')
      )
  )
}

interface Event {
  type?: string
  error?: unknown
  response?: { status?: string; error?: unknown }
}
// Treat EOF without response.completed as failure, even after text or tool output.
export async function* responseEvents<T extends Event>(
  response: Response,
  activity: () => void
): AsyncGenerator<T> {
  if (!response.ok || !response.body)
    throw responseError(
      await response.json().catch(() => null),
      response.status,
      response.headers.get('x-request-id')
    )
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '',
    frame: string[] = []
  function parse(): T | undefined {
    const data = frame
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    frame = []
    if (!data || data === '[DONE]') return
    return JSON.parse(data) as T
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (!done) activity()
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true })
      if (done && (buffer || frame.length)) buffer += '\n\n'
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line) {
          frame.push(line)
          continue
        }
        const event = parse()
        if (!event) continue
        if (event.type === 'response.failed' || event.type === 'error')
          throw responseError(
            { error: event.response?.error ?? event.error ?? event },
            undefined,
            response.headers.get('x-request-id')
          )
        if (event.type === 'response.incomplete')
          throw new Error(
            'ChatGPT returned an incomplete response. Please try again.'
          )
        if (
          event.type === 'response.completed' &&
          event.response?.status &&
          event.response.status !== 'completed'
        )
          throw new Error('ChatGPT did not complete the response.')
        yield event
        if (event.type === 'response.completed') return
      }
      if (done)
        throw new Error(
          'ChatGPT response was interrupted before completion. Please try again.'
        )
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

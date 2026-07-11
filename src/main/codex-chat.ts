// AI assistant backed by the Codex responses endpoint, authenticated with the
// user's ChatGPT account. Runs an agentic tool loop: the model can query the
// user's health data (live or demo) before answering.

import type { WebContents } from 'electron'
import type { AiEvent, ChatMessage } from '../shared/types'
import {
  getCodexAuthGeneration,
  getCodexTokens,
  isCodexAuthGenerationCurrent
} from './codex-auth'
import { AGENT_TOOLS, AGENT_TOOL_LABELS, runHealthAgentTool } from './health-agent-tools'

const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses'
const MODEL = 'gpt-5.6-terra'
const MAX_TOOL_TURNS = 8

function buildInstructions(): string {
  const now = new Date()
  const dateParts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    dateParts.find((item) => item.type === type)?.value ?? ''
  const today = `${part('year')}-${part('month')}-${part('day')}`
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return `You are OpenPulse, the built-in health assistant for Google Fitbit health data.

Today is ${today}; the user's local timezone is ${timezone}. Use civil calendar dates in that timezone.

For every claim about the user's data, call only the narrowest relevant tools and never invent a value. Use one day for an exact fact, 7-14 days for short comparisons, about 30 days for a trend, and 60-90 days for an exploratory relationship. If observations are sparse or the result warns that evidence is thin, request a larger useful range or explain the limitation. Prefer analyze_daily_metrics for arithmetic and correlation rather than calculating from a large table yourself. Distinguish missing data from zero. Correlation is not causation.

If a tool reports source "demo", mention once that the values are sample data because no health account is connected. Be warm, precise and concise. Use plain language, concrete dates and numbers, and at most one practical suggestion when relevant. Separate what the data shows from possible interpretation. Do not diagnose; recommend professional care for concerning symptoms or persistently abnormal readings without being alarmist.`
}

type InputItem = Record<string, unknown>

interface FunctionCallItem {
  type: string
  name?: string
  arguments?: string
  call_id?: string
  [key: string]: unknown
}

function toInputItems(history: ChatMessage[]): InputItem[] {
  return history.map((m) => ({
    type: 'message' as const,
    role: m.role,
    content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.text }]
  }))
}

interface ActiveRun {
  sender: WebContents
  chatId: string
  runId: string
  controller: AbortController
}

const activeRuns = new Map<string, ActiveRun>()

function runKey(sender: WebContents, chatId: string): string {
  return `${sender.id}:${chatId}`
}

export function cancelChat(sender: WebContents, chatId: string, runId: string): void {
  const run = activeRuns.get(runKey(sender, chatId))
  if (run?.runId === runId) run.controller.abort(new Error('Response stopped.'))
}

export function cancelAllChats(reason = 'Response cancelled.'): void {
  for (const run of activeRuns.values()) run.controller.abort(new Error(reason))
}

function cancellationError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Response cancelled.')
}

export async function runChat(
  sender: WebContents,
  chatId: string,
  runId: string,
  history: ChatMessage[]
): Promise<void> {
  const key = runKey(sender, chatId)
  if (activeRuns.has(key)) {
    if (!sender.isDestroyed()) {
      sender.send('ai:event', {
        type: 'error',
        chatId,
        runId,
        message: 'This chat already has a response in progress.'
      } satisfies AiEvent)
    }
    return
  }
  const controller = new AbortController()
  const { signal } = controller
  const run: ActiveRun = { sender, chatId, runId, controller }
  activeRuns.set(key, run)
  const onDestroyed = (): void => controller.abort(new Error('Window closed.'))
  sender.once('destroyed', onDestroyed)

  const emit = (event: AiEvent): void => {
    if (!sender.isDestroyed()) sender.send('ai:event', event)
  }

  try {
    const authGeneration = getCodexAuthGeneration()
    const tokens = await getCodexTokens(signal)
    if (!tokens || !isCodexAuthGenerationCurrent(authGeneration)) {
      throw new Error('Not signed in. Connect ChatGPT in Settings to use the assistant.')
    }
    const input: InputItem[] = toInputItems(history)
    let finalText = ''

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      signal.throwIfAborted()
      if (!isCodexAuthGenerationCurrent(authGeneration)) throw new Error('ChatGPT disconnected.')
      const resp = await fetch(CODEX_URL, {
        method: 'POST',
        signal,
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
          'OpenAI-Beta': 'responses=experimental',
          originator: 'codex_cli_rs',
          session_id: chatId,
          ...(tokens.accountId ? { 'chatgpt-account-id': tokens.accountId } : {})
        },
        body: JSON.stringify({
          model: MODEL,
          instructions: buildInstructions(),
          input,
          tools: AGENT_TOOLS,
          tool_choice: 'auto',
          parallel_tool_calls: false,
          store: false,
          stream: true,
          include: ['reasoning.encrypted_content'],
          prompt_cache_key: chatId
        })
      })

      if (!resp.ok || !resp.body) {
        const detail = await resp.text().catch(() => '')
        if (resp.status === 401) throw new Error('ChatGPT session expired. Reconnect in Settings.')
        if (resp.status === 400 && /model.+not supported/i.test(detail)) {
          throw new Error(
            `${MODEL} is not enabled for this ChatGPT account yet. The model request was sent correctly, but the account rejected it.`
          )
        }
        throw new Error(`Codex request failed (${resp.status}): ${detail.slice(0, 300)}`)
      }

      const functionCalls: FunctionCallItem[] = []
      const continuationItems: InputItem[] = []
      let turnText = ''
      let buffer = ''
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue
            const payload = line.slice(5).trim()
            if (!payload || payload === '[DONE]') continue
            let event: { type?: string; delta?: string; item?: FunctionCallItem; response?: { error?: { message?: string } } }
            try {
              event = JSON.parse(payload)
            } catch {
              continue
            }
            switch (event.type) {
              case 'response.output_text.delta':
                if (event.delta) {
                  turnText += event.delta
                  emit({ type: 'delta', chatId, runId, text: event.delta })
                }
                break
              case 'response.reasoning_summary_text.delta':
                emit({ type: 'reasoning', chatId, runId })
                break
              case 'response.output_item.done':
                if (event.item?.type === 'function_call') {
                  functionCalls.push(event.item)
                  continuationItems.push(event.item)
                } else if (event.item?.type === 'reasoning') {
                  continuationItems.push(event.item)
                }
                break
              case 'response.failed':
                throw new Error(event.response?.error?.message ?? 'The model reported a failure.')
            }
          }
        }
      }

      finalText += turnText
      signal.throwIfAborted()
      if (!isCodexAuthGenerationCurrent(authGeneration)) throw new Error('ChatGPT disconnected.')

      if (functionCalls.length === 0) {
        emit({ type: 'done', chatId, runId, text: finalText })
        return
      }

      input.push(...continuationItems)
      for (const call of functionCalls) {
        const name = call.name ?? ''
        const callId = call.call_id
        if (!callId) throw new Error(`Tool call ${name || '(unknown)'} did not include a call ID.`)
        emit({ type: 'tool', chatId, runId, name, label: AGENT_TOOL_LABELS[name] ?? `Running ${name}` })
        let args: Record<string, unknown> = {}
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {}
        } catch {
          // The tool returns a structured validation error for malformed input.
        }
        let output: string
        try {
          output = await runHealthAgentTool(name, args, signal)
        } catch (error) {
          if (signal.aborted) throw cancellationError(signal)
          output = JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
        }
        input.push({
          type: 'function_call_output',
          call_id: callId,
          output
        })
      }
    }
    emit({
      type: 'done',
      chatId,
      runId,
      text: finalText || 'I hit the tool-call limit before finishing — try a narrower question.'
    })
  } catch (err) {
    const error = signal.aborted ? cancellationError(signal) : err
    emit({ type: 'error', chatId, runId, message: error instanceof Error ? error.message : String(error) })
  } finally {
    sender.removeListener('destroyed', onDestroyed)
    if (activeRuns.get(key) === run) activeRuns.delete(key)
  }
}

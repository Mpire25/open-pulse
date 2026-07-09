// AI assistant backed by the Codex responses endpoint, authenticated with the
// user's ChatGPT account. Runs an agentic tool loop: the model can query the
// user's health data (live or demo) before answering.

import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { AiEvent, ChatMessage } from '../shared/types'
import { getCodexTokens } from './codex-auth'
import { getDashboardToday, getSleepHistory, getWeekSeries } from './health-service'

const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses'
const MODEL = 'gpt-5.1-codex'
const MAX_TOOL_TURNS = 8

const INSTRUCTIONS = `You are OpenPulse, the built-in health assistant of a macOS app that displays the user's Google Fitbit Air data (via the Google Health API).

You have tools that return the user's real data: today's dashboard, the last 7 days, and sleep history. Always call the relevant tools before answering questions about the user's health — never invent numbers. If the data source is "demo", mention once that this is sample data because no Fitbit account is connected yet.

Style: warm, precise, brief. Use plain language, concrete numbers and short paragraphs or compact bullet lists. Highlight trends, anomalies, and one actionable suggestion when relevant. You are not a doctor; for medical concerns (e.g. AFib alerts, persistently abnormal values) recommend seeing a professional, without being alarmist.`

interface ToolSpec {
  type: 'function'
  name: string
  description: string
  strict: boolean
  parameters: Record<string, unknown>
}

const TOOLS: ToolSpec[] = [
  {
    type: 'function',
    name: 'get_today_dashboard',
    description:
      "Today's snapshot: steps, active zone minutes, active energy (kcal), distance, floors, resting/current heart rate, intraday heart-rate series, HRV, SpO2, breathing rate, and last night's sleep.",
    strict: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    type: 'function',
    name: 'get_week_series',
    description:
      'Daily totals for the last 7 days: steps, active zone minutes, active energy, distance, sleep minutes, resting heart rate, HRV.',
    strict: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    type: 'function',
    name: 'get_sleep_history',
    description: 'Detailed sleep sessions (start/end, minutes asleep, stage segments and stage totals) for the last N nights.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        nights: { type: 'number', description: 'How many nights to fetch (1-30). Default 7.' }
      },
      additionalProperties: false
    }
  }
]

const TOOL_LABELS: Record<string, string> = {
  get_today_dashboard: 'Reading today’s metrics',
  get_week_series: 'Reading the last 7 days',
  get_sleep_history: 'Reading sleep history'
}

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_today_dashboard': {
      const data = await getDashboardToday()
      // Trim the heart-rate series to keep tool output compact.
      const series = data.heartRateSeries
      const step = Math.max(1, Math.floor(series.length / 48))
      return JSON.stringify({ ...data, heartRateSeries: series.filter((_, i) => i % step === 0) })
    }
    case 'get_week_series':
      return JSON.stringify(await getWeekSeries())
    case 'get_sleep_history': {
      const nights = Math.min(30, Math.max(1, Number(args.nights) || 7))
      const history = await getSleepHistory(nights)
      // Stage segments are large; send stage totals plus timing only.
      return JSON.stringify(
        history.map(({ stages, ...rest }) => ({ ...rest, stageSegmentCount: stages.length }))
      )
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

type InputItem =
  | { type: 'message'; role: 'user' | 'assistant'; content: Array<Record<string, string>> }
  | { type: 'function_call'; name: string; arguments: string; call_id: string }
  | { type: 'function_call_output'; call_id: string; output: string }

interface FunctionCallItem {
  type: string
  name?: string
  arguments?: string
  call_id?: string
}

function toInputItems(history: ChatMessage[]): InputItem[] {
  return history.map((m) => ({
    type: 'message' as const,
    role: m.role,
    content: [{ type: m.role === 'user' ? 'input_text' : 'output_text', text: m.text }]
  }))
}

export async function runChat(
  sender: WebContents,
  chatId: string,
  history: ChatMessage[]
): Promise<void> {
  const emit = (event: AiEvent): void => {
    if (!sender.isDestroyed()) sender.send('ai:event', event)
  }

  const tokens = await getCodexTokens()
  if (!tokens) {
    emit({
      type: 'error',
      chatId,
      message: 'Not signed in. Connect ChatGPT in Settings to use the assistant.'
    })
    return
  }

  const input: InputItem[] = toInputItems(history)
  let finalText = ''

  try {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const resp = await fetch(CODEX_URL, {
        method: 'POST',
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
          instructions: INSTRUCTIONS,
          input,
          tools: TOOLS,
          tool_choice: 'auto',
          parallel_tool_calls: false,
          store: false,
          stream: true,
          include: [],
          prompt_cache_key: chatId
        })
      })

      if (!resp.ok || !resp.body) {
        const detail = await resp.text().catch(() => '')
        throw new Error(
          resp.status === 401
            ? 'ChatGPT session expired. Reconnect in Settings.'
            : `Codex request failed (${resp.status}): ${detail.slice(0, 300)}`
        )
      }

      const functionCalls: FunctionCallItem[] = []
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
                  emit({ type: 'delta', chatId, text: event.delta })
                }
                break
              case 'response.reasoning_summary_text.delta':
                emit({ type: 'reasoning', chatId })
                break
              case 'response.output_item.done':
                if (event.item?.type === 'function_call') functionCalls.push(event.item)
                break
              case 'response.failed':
                throw new Error(event.response?.error?.message ?? 'The model reported a failure.')
            }
          }
        }
      }

      finalText += turnText

      if (functionCalls.length === 0) {
        emit({ type: 'done', chatId, text: finalText })
        return
      }

      for (const call of functionCalls) {
        const name = call.name ?? ''
        emit({ type: 'tool', chatId, name, label: TOOL_LABELS[name] ?? `Running ${name}` })
        let args: Record<string, unknown> = {}
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {}
        } catch {
          // tolerate malformed arguments; tools treat missing args as defaults
        }
        const output = await runTool(name, args)
        input.push({
          type: 'function_call',
          name,
          arguments: call.arguments ?? '{}',
          call_id: call.call_id ?? randomUUID()
        })
        input.push({
          type: 'function_call_output',
          call_id: call.call_id ?? '',
          output
        })
      }
    }
    emit({ type: 'done', chatId, text: finalText || 'I hit the tool-call limit before finishing — try a narrower question.' })
  } catch (err) {
    emit({ type: 'error', chatId, message: err instanceof Error ? err.message : String(err) })
  }
}

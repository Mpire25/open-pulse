// AI assistant backed by the Codex responses endpoint, authenticated with the
// user's ChatGPT account. Runs an agentic tool loop: the model can query the
// user's health data (live or demo) before answering.

import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { AiEvent, ChatMessage } from '../shared/types'
import { getCodexTokens } from './codex-auth'
import { getDevices, getHealthDay, getSleepHistory } from './health-service'

const CODEX_URL = 'https://chatgpt.com/backend-api/codex/responses'
const MODEL = 'gpt-5.6-terra'
const MAX_TOOL_TURNS = 8

const INSTRUCTIONS = `You are OpenPulse, the built-in health assistant of a macOS app that displays the user's Google Fitbit Air data (via the Google Health API).

You have tools that return the user's real data: a full snapshot for any calendar day (with its 14-day trend window), detailed sleep history, and paired-device status. Always call the relevant tools before answering questions about the user's health — never invent numbers. If the data source is "demo", mention once that this is sample data because no Fitbit account is connected yet.

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
    name: 'get_health_day',
    description:
      "Full snapshot for one calendar day: steps, distance, floors, calories out/in, active & zone minutes, sedentary time, resting heart rate, HRV, SpO2, breathing rate, skin-temperature deviation, VO2 max, weight, body fat, water, sleep (with stages), workouts, hourly steps, intraday heart rate, plus daily metrics for the 14 days ending on that date (the `trend` array).",
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Day to fetch, YYYY-MM-DD. Defaults to today. Future dates are clamped to today.'
        }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'get_sleep_history',
    description: 'Detailed sleep sessions (start/end, minutes asleep, efficiency, stage totals) for the last N nights.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        nights: { type: 'number', description: 'How many nights to fetch (1-30). Default 7.' }
      },
      additionalProperties: false
    }
  },
  {
    type: 'function',
    name: 'get_devices',
    description: 'Paired trackers: model, type, battery level and state, last sync time, hardware features.',
    strict: false,
    parameters: { type: 'object', properties: {}, additionalProperties: false }
  }
]

const TOOL_LABELS: Record<string, string> = {
  get_health_day: 'Reading day metrics',
  get_sleep_history: 'Reading sleep history',
  get_devices: 'Checking devices'
}

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'get_health_day': {
      const date = typeof args.date === 'string' ? args.date : new Date().toISOString().slice(0, 10)
      const data = await getHealthDay(date)
      // Trim intraday series to keep tool output compact.
      const step = Math.max(1, Math.floor(data.heartRate.length / 48))
      return JSON.stringify({
        ...data,
        heartRate: data.heartRate.filter((_, i) => i % step === 0),
        sleep: data.sleep ? { ...data.sleep, stages: undefined, stageSegmentCount: data.sleep.stages.length } : null
      })
    }
    case 'get_sleep_history': {
      const nights = Math.min(30, Math.max(1, Number(args.nights) || 7))
      const history = await getSleepHistory(nights)
      // Stage segments are large; send stage totals plus timing only.
      return JSON.stringify(
        history.map(({ stages, ...rest }) => ({ ...rest, stageSegmentCount: stages.length }))
      )
    }
    case 'get_devices':
      return JSON.stringify(await getDevices())
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
        if (resp.status === 401) throw new Error('ChatGPT session expired. Reconnect in Settings.')
        if (resp.status === 400 && /model.+not supported/i.test(detail)) {
          throw new Error(
            `${MODEL} is not enabled for this ChatGPT account yet. The model request was sent correctly, but the account rejected it.`
          )
        }
        throw new Error(`Codex request failed (${resp.status}): ${detail.slice(0, 300)}`)
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

// Local diagnostic trace of assistant runs: one JSON line per run recording
// what the model requested and what came back. Chats and health data are
// encrypted at rest, so this file records structure only — tool names, date
// ranges, observation counts, timings, token usage, errors — and never message
// text, research queries, or health values.

import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'

const MAX_TRACE_BYTES = 2_000_000
const RUNS_KEPT_AFTER_TRIM = 300

let traceFile: string | null = null

export function configureAssistantTrace(path: string | null): void {
  traceFile = path
}

export interface TraceUsage {
  inputTokens?: number
  cachedTokens?: number
  outputTokens?: number
  reasoningTokens?: number
}

interface TraceRequest {
  turn: number
  tools: string[]
  toolChoice: string
  inputItems: number
  firstByteMs?: number
  durationMs?: number
  usage?: TraceUsage
  functionCalls?: string[]
  textChars?: number
}

interface TraceToolCall {
  turn: number
  name: string
  args: unknown
  durationMs: number
  result: Record<string, unknown>
}

export interface AssistantRunTrace {
  startRequest(details: { turn: number; tools: string[]; toolChoice: string; inputItems: number }): {
    firstByte(): void
    finish(details: { usage?: TraceUsage; functionCalls: string[]; textChars: number }): void
  }
  toolCall(details: { turn: number; name: string; args: unknown; startedAt: number; output: string }): void
  finish(outcome: string, error?: string): void
}

const IDENTIFIER = /^[A-Za-z0-9_:.-]{1,64}$/

/** Keeps dates, enum values and identifiers; replaces free text with its length. */
export function traceArgs(value: unknown): unknown {
  if (typeof value === 'string') return IDENTIFIER.test(value) ? value : `[text:${value.length}]`
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value
  if (Array.isArray(value)) return value.map(traceArgs)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, traceArgs(item)]))
  }
  return null
}

/** The shape of a tool result: ranges, counts and errors, never the values. */
export function traceToolResult(output: string): Record<string, unknown> {
  const result: Record<string, unknown> = { chars: output.length }
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return { ...result, unparsable: true }
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return result
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (key === 'error' && typeof value === 'string') result.error = value
    else if (key === 'requestedRange' || key === 'range' || key === 'observations') result[key] = value
    else if (key === 'displayed' || key === 'searched' || key === 'datasetId') result[key] = value
    else if (Array.isArray(value)) result[`${key}Count`] = value.length
    else if (key === 'days' && value != null && typeof value === 'object') {
      result.daysCount = Object.keys(value).length
    }
  }
  return result
}

export function traceUsage(value: unknown): TraceUsage | undefined {
  if (value == null || typeof value !== 'object') return undefined
  const usage = value as {
    input_tokens?: number
    output_tokens?: number
    input_tokens_details?: { cached_tokens?: number }
    output_tokens_details?: { reasoning_tokens?: number }
  }
  return {
    inputTokens: usage.input_tokens,
    cachedTokens: usage.input_tokens_details?.cached_tokens,
    outputTokens: usage.output_tokens,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens
  }
}

function append(line: string): void {
  if (!traceFile) return
  try {
    appendFileSync(traceFile, `${line}\n`)
    if (statSync(traceFile).size > MAX_TRACE_BYTES) {
      const lines = readFileSync(traceFile, 'utf8').split('\n').filter(Boolean)
      writeFileSync(traceFile, `${lines.slice(-RUNS_KEPT_AFTER_TRIM).join('\n')}\n`)
    }
  } catch (error) {
    console.warn('[assistant-trace] could not write trace:', error)
  }
}

export function startAssistantRunTrace(meta: {
  chatId: string
  runId: string
  model: string
  reasoningEffort: string
  historyMessages: number
}): AssistantRunTrace {
  const startedAt = Date.now()
  const requests: TraceRequest[] = []
  const toolCalls: TraceToolCall[] = []
  let finished = false

  return {
    startRequest(details) {
      const request: TraceRequest = { ...details }
      const requestStartedAt = Date.now()
      requests.push(request)
      return {
        firstByte() {
          request.firstByteMs ??= Date.now() - requestStartedAt
        },
        finish({ usage, functionCalls, textChars }) {
          request.durationMs = Date.now() - requestStartedAt
          request.usage = usage
          request.functionCalls = functionCalls
          request.textChars = textChars
        }
      }
    },
    toolCall({ turn, name, args, startedAt: callStartedAt, output }) {
      toolCalls.push({
        turn,
        name,
        args: name === 'research_web' ? traceArgs({ query: (args as { query?: unknown })?.query }) : traceArgs(args),
        durationMs: Date.now() - callStartedAt,
        result: traceToolResult(output)
      })
    },
    finish(outcome, error) {
      if (finished) return
      finished = true
      append(JSON.stringify({
        at: new Date(startedAt).toISOString(),
        ...meta,
        outcome,
        ...(error ? { error } : {}),
        durationMs: Date.now() - startedAt,
        requests,
        toolCalls
      }))
    }
  }
}

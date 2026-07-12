import type { AssistantVisualPart } from '../shared/types'

export type AgentTraceMode = 'off' | 'summary' | 'json' | 'verbose'

interface TraceUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type AgentTracePayload =
  | { type: 'run_started'; model: string; messages: number; maxTurns: number }
  | { type: 'auth_ready'; accountScoped: boolean }
  | {
      type: 'turn_started'
      turn: number
      maxTurns: number
      inputItems: number
      datasets: number
      visuals: number
      finalResponse: boolean
    }
  | {
      type: 'model_responded'
      turn: number
      durationMs: number
      functionCalls: number
      textChars: number
      citations: number
      usage?: TraceUsage
    }
  | { type: 'web_search_started'; turn: number }
  | { type: 'web_search_completed'; turn: number }
  | { type: 'tool_started'; turn: number; name: string; callId: string; arguments: Record<string, unknown> }
  | {
      type: 'tool_completed'
      turn: number
      name: string
      callId: string
      durationMs: number
      bytes: number
      result: Record<string, unknown>
    }
  | { type: 'tool_failed'; turn: number; name: string; callId: string; durationMs: number; message: string }
  | {
      type: 'presentation_resolved'
      turn: number
      requested: number
      displayed: number
      totalVisuals: number
      visualTypes: AssistantVisualPart['type'][]
      source: 'model' | 'fallback'
    }
  | {
      type: 'budget_exhausted'
      turns: number
      maxTurns: number
      healthTools: number
      presentationCalls: number
      webSearches: number
      textChars: number
      visuals: number
    }
  | {
      type: 'run_completed'
      turns: number
      healthTools: number
      presentationCalls: number
      webSearches: number
      textChars: number
      visuals: number
    }
  | { type: 'run_failed'; cancelled: boolean; message: string; stack?: string }

export type AgentTraceEvent = AgentTracePayload & {
  traceId: string
  chatId: string
  runId: string
  sequence: number
  elapsedMs: number
}

function traceMode(): AgentTraceMode {
  const configured = process.env.OPENPULSE_AI_TRACE?.trim().toLowerCase()
  if (configured === '0' || configured === 'off' || configured === 'false') return 'off'
  if (configured === 'json') return 'json'
  if (configured === 'verbose') return 'verbose'
  if (configured === '1' || configured === 'on' || configured === 'true' || configured === 'summary') {
    return 'summary'
  }
  return 'off'
}

function shortId(value: string): string {
  return value.replaceAll('-', '').slice(0, 8) || 'unknown'
}

function formatDuration(milliseconds: number): string {
  return milliseconds < 1_000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1_000).toFixed(1)}s`
}

function detail(value: unknown): string {
  return JSON.stringify(value)
}

export function formatAgentTraceEvent(event: AgentTraceEvent): string {
  const prefix = `[AI ${event.traceId} +${formatDuration(event.elapsedMs)}]`
  switch (event.type) {
    case 'run_started':
      return `${prefix} Run started · ${event.model} · ${event.messages} messages · budget ${event.maxTurns} turns`
    case 'auth_ready':
      return `${prefix} Auth ready · ${event.accountScoped ? 'ChatGPT account scoped' : 'no account header'}`
    case 'turn_started':
      return `${prefix} Turn ${event.turn}/${event.maxTurns}${event.finalResponse ? ' · final response' : ''} · ${event.inputItems} input items · ${event.datasets} datasets · ${event.visuals} visuals`
    case 'model_responded': {
      const usage = event.usage?.totalTokens != null ? ` · ${event.usage.totalTokens} tokens` : ''
      return `${prefix} Model responded in ${formatDuration(event.durationMs)} · ${event.functionCalls} function calls · ${event.textChars} text chars · ${event.citations} citations${usage}`
    }
    case 'web_search_started':
      return `${prefix} Web search started · turn ${event.turn}`
    case 'web_search_completed':
      return `${prefix} Web search completed · turn ${event.turn}`
    case 'tool_started':
      return `${prefix} Tool started · ${event.name} · ${shortId(event.callId)} · ${detail(event.arguments)}`
    case 'tool_completed':
      return `${prefix} Tool completed · ${event.name} · ${formatDuration(event.durationMs)} · ${event.bytes} bytes · ${detail(event.result)}`
    case 'tool_failed':
      return `${prefix} Tool failed · ${event.name} · ${formatDuration(event.durationMs)} · ${event.message}`
    case 'presentation_resolved':
      return `${prefix} Presentation (${event.source}) · requested ${event.requested} · displayed ${event.displayed} · total ${event.totalVisuals} · ${event.visualTypes.join(', ') || 'none'}`
    case 'budget_exhausted':
      return `${prefix} BUDGET EXHAUSTED · turns ${event.turns}/${event.maxTurns} · health ${event.healthTools} · presentation ${event.presentationCalls} · web ${event.webSearches} · text ${event.textChars} chars · visuals ${event.visuals}`
    case 'run_completed':
      return `${prefix} Complete · ${event.turns} turns · health ${event.healthTools} · presentation ${event.presentationCalls} · web ${event.webSearches} · ${event.textChars} text chars · ${event.visuals} visuals`
    case 'run_failed':
      return `${prefix} ${event.cancelled ? 'Cancelled' : 'Failed'} · ${event.message}${event.stack ? `\n${event.stack}` : ''}`
  }
}

export class AgentTracer {
  private readonly startedAt = performance.now()
  private readonly mode = traceMode()
  private sequence = 0
  private readonly traceId: string
  private readonly chatId: string
  private readonly runId: string

  constructor(chatId: string, runId: string) {
    this.traceId = shortId(runId)
    this.chatId = shortId(chatId)
    this.runId = shortId(runId)
  }

  emit(payload: AgentTracePayload): void {
    if (this.mode === 'off') return
    const event = {
      ...payload,
      traceId: this.traceId,
      chatId: this.chatId,
      runId: this.runId,
      sequence: ++this.sequence,
      elapsedMs: Math.round(performance.now() - this.startedAt)
    } as AgentTraceEvent
    if (this.mode === 'json') console.log(JSON.stringify(event))
    else console.log(formatAgentTraceEvent(event))
  }

  failure(error: unknown, cancelled: boolean): void {
    const normalized = error instanceof Error ? error : new Error(String(error))
    this.emit({
      type: 'run_failed',
      cancelled,
      message: normalized.message,
      ...(this.mode === 'verbose' && normalized.stack ? { stack: normalized.stack } : {})
    })
  }
}

export function summarizeToolArguments(name: string, args: Record<string, unknown>): Record<string, unknown> {
  if (name === 'present_health_data') {
    return {
      overviews: Array.isArray(args.overviews) ? args.overviews.length : 0,
      metricCards: Array.isArray(args.metricCards) ? args.metricCards.length : 0,
      comparisons: Array.isArray(args.comparisons) ? args.comparisons.length : 0,
      charts: Array.isArray(args.charts) ? args.charts.length : 0,
      sleepCards: Array.isArray(args.sleepCards) ? args.sleepCards.length : 0,
      nutritionCards: Array.isArray(args.nutritionCards) ? args.nutritionCards.length : 0,
      workouts: Array.isArray(args.workouts) ? args.workouts.length : 0
    }
  }
  const safe: Record<string, unknown> = {}
  for (const key of ['metrics', 'startDate', 'endDate', 'date', 'operation', 'detail', 'signal']) {
    const value = args[key]
    if (typeof value === 'string') safe[key] = value.slice(0, 120)
    else if (Array.isArray(value)) safe[key] = value.filter((item) => typeof item === 'string').slice(0, 8)
  }
  return safe
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function summarizeToolResult(name: string, value: unknown): Record<string, unknown> {
  if (name === 'get_devices' && Array.isArray(value)) return { devices: value.length }
  const data = record(value)
  if (!data) return { shape: Array.isArray(value) ? 'array' : typeof value }
  if ('error' in data) return { error: String(data.error).slice(0, 200) }
  const source = data.source === 'live' || data.source === 'demo' ? data.source : undefined
  if (name === 'query_daily_metrics') {
    return {
      source,
      range: data.requestedRange,
      metrics: Object.keys(record(data.units) ?? {}),
      observations: data.observations
    }
  }
  if (name === 'analyze_daily_metrics') {
    return {
      source,
      range: data.range,
      metrics: Object.keys(record(data.summaries) ?? {}),
      pairedObservations: record(data.correlation)?.pairedObservations
    }
  }
  if (name === 'query_sleep') return { source, range: data.requestedRange, nights: Array.isArray(data.nights) ? data.nights.length : 0 }
  if (name === 'query_workouts') return { source, range: data.requestedRange, workouts: Array.isArray(data.workouts) ? data.workouts.length : 0 }
  if (name === 'query_intraday') {
    return {
      source,
      date: data.date,
      hourlyPoints: Array.isArray(data.stepsHourly) ? data.stepsHourly.length : undefined,
      heartPoints: Array.isArray(data.heartRate) ? data.heartRate.length : undefined
    }
  }
  if (name === 'query_nutrition_logs') return { source, date: data.date, entries: Array.isArray(data.entries) ? data.entries.length : 0 }
  if (name === 'query_body_measurements') return { source, range: data.requestedRange, measurements: Array.isArray(data.measurements) ? data.measurements.length : 0 }
  return { source, keys: Object.keys(data).slice(0, 12) }
}

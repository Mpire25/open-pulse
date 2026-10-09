// What an eval run records, and the checks cases are scored with. Checks are
// deterministic so two runs of the same code are directly comparable.

import type { AssistantVisualPart } from '../src/shared/types'
import { dateAgo, datesBetween, type HealthCall } from './fixture'

export interface ModelRequest {
  /** 'agent' for the main loop, 'research' for the isolated web-search call. */
  kind: 'agent' | 'research'
  tools: string[]
  toolChoice?: string
  startedAt: number
  firstByteMs?: number
  durationMs?: number
  functionCalls: string[]
  inputTokens?: number
  cachedTokens?: number
  outputTokens?: number
  reasoningTokens?: number
}

export interface RunRecord {
  text: string
  parts: AssistantVisualPart[]
  outcome: 'completed' | 'tool-limit' | 'interrupted' | 'error' | 'timeout'
  error?: string
  healthCalls: HealthCall[]
  modelRequests: ModelRequest[]
  toolEvents: string[]
  totalMs: number
  firstTextMs?: number
}

export interface Check {
  name: string
  /** A case fails if any critical check fails. Non-critical checks only lower its score. */
  critical: boolean
  run(record: RunRecord): boolean
}

// ---------------------------------------------------------------------------
// Reading answers

/** Every number in the text, with thousands separators removed. */
export function numbersIn(text: string): number[] {
  return [...text.replace(/(\d),(?=\d{3}\b)/g, '$1').matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
}

/**
 * Every duration in the text, in minutes: "6h 5m", "6 hr 5 min", "6 hours and
 * 5 minutes", "6h05", "365 minutes", "6.1 hours".
 */
export function durationsIn(text: string): number[] {
  const found: number[] = []
  const pattern =
    /(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b(?:\s*(?:and\s*)?(\d{1,2})\s*(?:m|min|mins|minute|minutes)?\b)?|(\d+)\s*(?:m|min|mins|minute|minutes)\b|(\d{1,2}):(\d{2})\b|(\d+)h(\d{2})\b/gi
  for (const match of text.matchAll(pattern)) {
    if (match[1] != null) found.push(Number(match[1]) * 60 + Number(match[2] ?? 0))
    else if (match[3] != null) found.push(Number(match[3]))
    else if (match[4] != null) found.push(Number(match[4]) * 60 + Number(match[5]))
    else if (match[6] != null) found.push(Number(match[6]) * 60 + Number(match[7]))
  }
  return found
}

// ---------------------------------------------------------------------------
// What was read

export type Signal =
  | { metric: string }
  | { kind: 'sleep' | 'workouts' | 'body' | 'nutrition' | 'intraday' | 'devices' }

function signalLabel(signal: Signal): string {
  return 'metric' in signal ? signal.metric : signal.kind
}

/** The dates each health call read for a signal. */
export function datesRead(calls: HealthCall[], signal: Signal): Set<string> {
  const dates = new Set<string>()
  for (const call of calls) {
    const range = call.start && call.end ? datesBetween(call.start, call.end) : call.date ? [call.date] : []
    const matches =
      'metric' in signal
        ? (call.fn === 'getSeries' && call.metrics?.includes(signal.metric as never)) ||
          (call.fn === 'getBodyMeasurements' && ['weightKg', 'bodyFatPct', 'bmi'].includes(signal.metric)) ||
          (call.fn === 'getSleepRange' && ['sleepMinutes', 'sleepEfficiency'].includes(signal.metric)) ||
          (call.fn === 'getNutritionLogs' && signal.metric === 'caloriesIn')
        : signal.kind === 'sleep'
          ? call.fn === 'getSleepRange' ||
            (call.fn === 'getSeries' && (call.metrics?.includes('sleepMinutes') ?? false))
          : signal.kind === 'workouts'
            ? call.fn === 'getWorkoutsRange'
            : signal.kind === 'body'
              ? call.fn === 'getBodyMeasurements' ||
                (call.fn === 'getSeries' && (call.metrics?.includes('weightKg') ?? false))
              : signal.kind === 'nutrition'
                ? call.fn === 'getNutritionLogs'
                : signal.kind === 'intraday'
                  ? call.fn.startsWith('getIntraday')
                  : call.fn === 'getDevices'
    if (matches) for (const date of range) dates.add(date)
    if (matches && 'kind' in signal && signal.kind === 'devices') dates.add('devices')
  }
  return dates
}

// ---------------------------------------------------------------------------
// Check builders

export function completed(): Check {
  return {
    name: 'finished with an answer',
    critical: true,
    run: (record) => record.outcome === 'completed' && record.text.trim().length > 0
  }
}

/** Read the signal for at least `share` of the days in [fromDaysAgo, toDaysAgo]. */
export function read(
  signal: Signal,
  fromDaysAgo: number,
  toDaysAgo = 0,
  options: { share?: number; critical?: boolean } = {}
): Check {
  const share = options.share ?? 0.9
  const label = fromDaysAgo === toDaysAgo
    ? `read ${signalLabel(signal)} for ${fromDaysAgo === 0 ? 'today' : `${fromDaysAgo}d ago`}`
    : `read ${signalLabel(signal)} over ${fromDaysAgo - toDaysAgo + 1}+ days`
  return {
    name: label,
    critical: options.critical ?? true,
    run: (record) => {
      const dates = datesRead(record.healthCalls, signal)
      if ('kind' in signal && signal.kind === 'devices') return dates.size > 0
      const wanted = datesBetween(dateAgo(fromDaysAgo), dateAgo(toDaysAgo))
      return wanted.filter((date) => dates.has(date)).length >= Math.ceil(wanted.length * share)
    }
  }
}

export function mentionsNumber(
  name: string,
  value: number,
  tolerance: number,
  options: { critical?: boolean } = {}
): Check {
  return {
    name,
    critical: options.critical ?? true,
    run: (record) => numbersIn(record.text).some((n) => Math.abs(n - value) <= tolerance)
  }
}

export function mentionsDuration(
  name: string,
  minutes: number,
  tolerance: number,
  options: { critical?: boolean } = {}
): Check {
  return {
    name,
    critical: options.critical ?? true,
    run: (record) => durationsIn(record.text).some((n) => Math.abs(n - minutes) <= tolerance)
  }
}

export function says(name: string, pattern: RegExp, options: { critical?: boolean } = {}): Check {
  return { name, critical: options.critical ?? true, run: (record) => pattern.test(record.text) }
}

export function neverSays(name: string, pattern: RegExp, options: { critical?: boolean } = {}): Check {
  return { name, critical: options.critical ?? true, run: (record) => !pattern.test(record.text) }
}

export function noResearch(): Check {
  return {
    name: 'did not search the web',
    critical: false,
    run: (record) => !record.modelRequests.some((request) => request.kind === 'research')
  }
}

export function atMostModelRequests(limit: number): Check {
  return {
    name: `at most ${limit} model requests`,
    critical: false,
    run: (record) => record.modelRequests.filter((request) => request.kind === 'agent').length <= limit
  }
}

export function showsVisual(name = 'showed a visual', options: { critical?: boolean } = {}): Check {
  return { name, critical: options.critical ?? false, run: (record) => record.parts.length > 0 }
}

// Claims that the data is missing or limited, which the fixture never justifies
// outside the deliberate tracker gap.
export const CLAIMS_NO_DATA =
  /\b(?:only (?:have|see|has|got|shows?)[^.]{0,40}(?:today|one day|a single day|1 day)|(?:don't|do not|can't|cannot) (?:see|find|access) (?:any|enough|your)[^.]{0,30}(?:data|history|records)|no (?:\w+ )?data (?:is )?(?:available|recorded))/i

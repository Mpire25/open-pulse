import { shiftIsoDate } from './health-api'
import type { MetricKey } from '../shared/types'

export type FastHealthTool = 'query_daily_metrics' | 'analyze_daily_metrics' | 'query_sleep'

export interface FastHealthPlan {
  tool: FastHealthTool
  args: Record<string, unknown>
  reason: 'exact-value' | 'recent-range' | 'trend'
}

const COMPLEX_REQUEST =
  /\b(why|cause|causing|affect|impact|influence|relationship|correlat(?:e|ed|es|ing|ion|ions)?|association|explain|interpret|recommend|advice|should i|normal|healthy|good|bad|low|high|enough|safe|unsafe|research|study|studies|evidence|guideline|latest|web|reddit|forum|deep dive|thorough|comprehensive|overall health|health overview)\b/i
const TREND_REQUEST = /\b(trend|trending|over time|up or down|increas(?:e|ing)|decreas(?:e|ing))\b/i
const COMPARISON_REQUEST = /\b(compare|compared|comparison|versus|vs\.?|difference|match(?:es|ed|ing)?|align(?:s|ed|ing)?|correspond(?:s|ed|ing)?|track(?:s|ed|ing)? with|than last|this week.*last week|this month.*last month)\b/i
const EXACT_REQUEST = /\b(how many|how much|what (?:was|is|were|are)|show me|did i|get yesterday|today|yesterday|last night|night before last|on \d{4}-\d{2}-\d{2})\b/i

const METRIC_MATCHERS: Array<{ metric: MetricKey; pattern: RegExp }> = [
  { metric: 'activeZoneMinutes', pattern: /\b(active zone minutes?|zone minutes?)\b/i },
  { metric: 'activeMinutes', pattern: /\bactive minutes?\b/i },
  { metric: 'sedentaryMinutes', pattern: /\b(sedentary|inactive) minutes?\b/i },
  { metric: 'restingHeartRate', pattern: /\b(resting heart rate|resting pulse|rhr)\b/i },
  { metric: 'hrvMs', pattern: /\b(hrv|heart rate variability)\b/i },
  { metric: 'spo2Pct', pattern: /\b(spo2|blood oxygen|oxygen saturation)\b/i },
  { metric: 'breathingRate', pattern: /\b(breathing|respiratory) rate\b/i },
  { metric: 'skinTempDeltaC', pattern: /\b(skin temperature|temperature deviation)\b/i },
  { metric: 'sleepEfficiency', pattern: /\bsleep efficiency\b/i },
  { metric: 'weightKg', pattern: /\b(weight|weigh)\b/i },
  { metric: 'bodyFatPct', pattern: /\bbody fat\b/i },
  { metric: 'bmi', pattern: /\bbmi\b/i },
  { metric: 'waterMl', pattern: /\b(water|hydration|hydrate|drank)\b/i },
  { metric: 'proteinG', pattern: /\bprotein\b/i },
  { metric: 'carbsG', pattern: /\b(carbs?|carbohydrates?)\b/i },
  { metric: 'fatG', pattern: /\b(?:dietary |total )?fat\b/i },
  { metric: 'fiberG', pattern: /\bfib(?:er|re)\b/i },
  { metric: 'saturatedFatG', pattern: /\bsaturated fat\b/i },
  { metric: 'sodiumG', pattern: /\b(sodium|salt)\b/i },
  { metric: 'sugarG', pattern: /\bsugar\b/i },
  { metric: 'steps', pattern: /\bsteps?\b/i },
  { metric: 'distanceKm', pattern: /\bdistance\b/i },
  { metric: 'floors', pattern: /\b(floors?|flights?)\b/i }
]

function todayIso(now = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function startOfWeek(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`)
  const daysSinceMonday = (parsed.getUTCDay() + 6) % 7
  return shiftIsoDate(date, -daysSinceMonday)
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`
}

function previousMonth(date: string): { start: string; end: string } {
  const first = new Date(`${startOfMonth(date)}T12:00:00Z`)
  first.setUTCMonth(first.getUTCMonth() - 1)
  const start = first.toISOString().slice(0, 10)
  const endDate = new Date(first)
  endDate.setUTCMonth(endDate.getUTCMonth() + 1)
  endDate.setUTCDate(0)
  return { start, end: endDate.toISOString().slice(0, 10) }
}

function explicitDate(text: string): string | null {
  const match = text.match(/\b(\d{4}-\d{2}-\d{2})\b/)
  if (!match) return null
  const parsed = new Date(`${match[1]}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === match[1]
    ? match[1]
    : null
}

const FULL_MONTH_NAME =
  /\b(?:january|february|march|april|june|july|august|september|october|november|december)\b/i
const CONTEXTUAL_MONTH_NAME =
  /\b(?:in|on|since|during|from|until|through)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i
const FULL_WEEKDAY_NAME =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
const CONTEXTUAL_WEEKDAY_NAME =
  /\b(?:on|last|this|next)\s+(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\.?\b/i

function hasUnparsedDateLanguage(text: string): boolean {
  return (
    /\b\d{4}-\d{2}-\d{2}\b/.test(text) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text) ||
    /\b\d{1,2}(?:st|nd|rd|th)\b/i.test(text) ||
    /\b(?:day|week|month|year)s?\s+ago\b/i.test(text) ||
    /\b(?:next|previous)\s+(?:day|week|month|year)\b/i.test(text) ||
    FULL_MONTH_NAME.test(text) ||
    CONTEXTUAL_MONTH_NAME.test(text) ||
    FULL_WEEKDAY_NAME.test(text) ||
    CONTEXTUAL_WEEKDAY_NAME.test(text)
  )
}

function isOneEditFrom(value: string, expected: string): boolean {
  if (value === expected || Math.abs(value.length - expected.length) > 1) return false
  let valueIndex = 0
  let expectedIndex = 0
  let edits = 0
  while (valueIndex < value.length && expectedIndex < expected.length) {
    if (value[valueIndex] === expected[expectedIndex]) {
      valueIndex++
      expectedIndex++
      continue
    }
    if (++edits > 1) return false
    if (value.length > expected.length) valueIndex++
    else if (expected.length > value.length) expectedIndex++
    else {
      valueIndex++
      expectedIndex++
    }
  }
  return edits + (value.length - valueIndex) + (expected.length - expectedIndex) === 1
}

function hasLikelyMisspelledDateLanguage(text: string): boolean {
  return (text.match(/\b[a-z]+\b/gi) ?? []).some((word) =>
    isOneEditFrom(word.toLowerCase(), 'yesterday')
  )
}

function recognizedTemporalSelectorCount(text: string): number {
  let remaining = text
  let count = 0
  const selectors = [
    /\bnight before last\b/gi,
    /\bday before yesterday\b/gi,
    /\b(?:past|last) \d{1,3} days?\b/gi,
    /\blast night\b/gi,
    /\bthis week\b/gi,
    /\blast week\b/gi,
    /\bthis month\b/gi,
    /\blast month\b/gi,
    /\byesterday\b/gi,
    /\btoday\b/gi,
    /\btonight\b/gi
  ]
  for (const selector of selectors) {
    count += remaining.match(selector)?.length ?? 0
    remaining = remaining.replace(selector, ' ')
  }
  return count
}

function requestedRange(
  text: string,
  today: string,
  mode: 'exact-value' | 'recent-range' | 'trend'
): { startDate: string; endDate: string } | null {
  const isoDates = text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []
  if (isoDates.length > 0) {
    if (isoDates.length !== 1) return null
    const exact = explicitDate(text)
    if (!exact) return null
    const remaining = text.replace(isoDates[0], ' ')
    if (
      recognizedTemporalSelectorCount(remaining) > 0 ||
      hasUnparsedDateLanguage(remaining)
    ) {
      return null
    }
    return { startDate: exact, endDate: exact }
  }

  if (
    hasUnparsedDateLanguage(text) ||
    hasLikelyMisspelledDateLanguage(text) ||
    recognizedTemporalSelectorCount(text) > 1
  ) return null
  if (/\bnight before last\b/i.test(text)) {
    const date = shiftIsoDate(today, -1)
    return { startDate: date, endDate: date }
  }
  if (/\bday before yesterday\b/i.test(text)) {
    const date = shiftIsoDate(today, -2)
    return { startDate: date, endDate: date }
  }
  if (/\byesterday\b/i.test(text)) {
    const date = shiftIsoDate(today, -1)
    return { startDate: date, endDate: date }
  }
  if (/\b(last night|today|tonight)\b/i.test(text)) return { startDate: today, endDate: today }

  const numberedDays = text.match(/\b(?:past|last) (\d{1,3}) days?\b/i)
  if (numberedDays) {
    const days = Number(numberedDays[1])
    if (days < 1 || days > 120) return null
    return { startDate: shiftIsoDate(today, -(days - 1)), endDate: today }
  }

  const thisWeek = startOfWeek(today)
  if (/\blast week\b/i.test(text)) {
    return { startDate: shiftIsoDate(thisWeek, -7), endDate: shiftIsoDate(thisWeek, -1) }
  }
  if (/\bthis week\b/i.test(text)) return { startDate: thisWeek, endDate: today }

  if (/\b(?:over|for) the last month\b|\b(?:the )?past month\b/i.test(text)) {
    return { startDate: shiftIsoDate(today, -29), endDate: today }
  }
  const lastMonth = previousMonth(today)
  if (/\blast month\b/i.test(text)) return { startDate: lastMonth.start, endDate: lastMonth.end }
  if (/\bthis month\b/i.test(text)) return { startDate: startOfMonth(today), endDate: today }

  if (mode === 'trend') return { startDate: shiftIsoDate(today, -29), endDate: today }
  if (mode === 'exact-value') return { startDate: today, endDate: today }
  return null
}

function requestedMetrics(text: string): MetricKey[] {
  let metrics = METRIC_MATCHERS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ metric }) => metric)

  if (/\bsleep\b/i.test(text)) {
    metrics.push('sleepMinutes')
    if (!metrics.includes('sleepEfficiency')) metrics.push('sleepEfficiency')
  }
  if (/\b(calories?|energy)\b/i.test(text)) {
    const mentionsIntake =
      /\b(ate|eaten|eat|intake|consum(?:e[ds]?|ing|ption)|food|nutrition)\b/i.test(text)
    const mentionsBurn =
      /\b(burn(?:ed|ing|s)?|burnt|output|expenditure)\b/i.test(text) ||
      /\b(?:active|activity) calories?\b/i.test(text) ||
      /\bcalories?\s+from\s+(?:my\s+)?activit(?:y|ies)\b/i.test(text)

    if (mentionsIntake) metrics.push('caloriesIn')
    if (mentionsBurn) metrics.push('caloriesOut')
  }
  if (metrics.includes('saturatedFatG') && !/\b(total|dietary) fat\b/i.test(text)) {
    metrics = metrics.filter((metric) => metric !== 'fatG')
  }
  if (
    metrics.includes('bodyFatPct') &&
    !/\b(?:dietary|total) fat\b|\bfat\b[\s\S]{0,40}\b(?:ate|eaten|intake|nutrition)\b/i.test(text)
  ) {
    metrics = metrics.filter((metric) => metric !== 'fatG')
  }

  return [...new Set(metrics)].slice(0, 8)
}

export function requestMentionsTrackedHealthData(text: string): boolean {
  return (
    requestedMetrics(text).length > 0 ||
    /\b(?:activity|workouts?|exercise|recovery|health data|readings?|baseline|calories?)\b/i.test(text)
  )
}

/**
 * Selects only requests for which one narrow, existing health query is very
 * likely to contain the complete answer. Ambiguous or interpretive requests
 * deliberately fall back to the full agent.
 */
export function fastHealthPlanForRequest(
  userText: string,
  today = todayIso()
): FastHealthPlan | null {
  const text = userText.trim()
  if (!text || COMPLEX_REQUEST.test(text)) return null

  const comparison = COMPARISON_REQUEST.test(text)
  if (comparison) return null
  const trend = TREND_REQUEST.test(text)
  const exact = EXACT_REQUEST.test(text)
  const rangeLanguage =
    /\b(this|last|past|previous) (week|month)|\b(?:past|last) \d{1,3} days?\b/i.test(text)
  if (!trend && !exact && !rangeLanguage) return null

  const reason: FastHealthPlan['reason'] = trend
    ? 'trend'
    : rangeLanguage
      ? 'recent-range'
      : 'exact-value'
  const range = requestedRange(text, today, reason)
  if (!range) return null

  const sleepRequest = /\b(?:sleep|slept|asleep|bed)\b/i.test(text)
  const oneDay = range.startDate === range.endDate
  const metrics = requestedMetrics(text)
  const nonSleepMetrics = metrics.filter(
    (metric) => metric !== 'sleepMinutes' && metric !== 'sleepEfficiency'
  )
  if (sleepRequest && oneDay && nonSleepMetrics.length === 0) {
    const detail = /\b(stages?|breakdown|structure|interrupt|awake|wake|woke|out of bed)\b/i.test(text)
      ? 'detailed'
      : 'summary'
    return {
      tool: 'query_sleep',
      args: { ...range, detail },
      reason
    }
  }
  if (
    sleepRequest &&
    oneDay &&
    nonSleepMetrics.length > 0 &&
    /\b(stages?|breakdown|structure|interrupt|awake|wake|woke|out of bed)\b/i.test(text)
  ) {
    return null
  }

  if (!metrics.length) return null
  if (reason === 'trend') {
    if (metrics.length > 2) return null
    return {
      tool: 'analyze_daily_metrics',
      args: { metrics, ...range, operation: 'summary' },
      reason
    }
  }
  return {
    tool: 'query_daily_metrics',
    args: { metrics, ...range },
    reason
  }
}

import { shiftIsoDate } from './health-api'
import type { MetricKey } from '../shared/types'

export type FastHealthTool = 'query_daily_metrics' | 'analyze_daily_metrics' | 'query_sleep'

export interface FastHealthPlan {
  tool: FastHealthTool
  args: Record<string, unknown>
  reason: 'exact-value' | 'recent-range' | 'trend' | 'comparison'
}

const COMPLEX_REQUEST =
  /\b(why|cause|causing|affect|impact|influence|relationship|correlat(?:e|ed|es|ing|ion|ions)?|association|explain|interpret|recommend|advice|should i|normal|healthy|good|bad|low|high|enough|safe|unsafe|research|study|studies|evidence|guideline|latest|web|reddit|forum|deep dive|thorough|comprehensive|overall health|health overview)\b/i
const TREND_REQUEST = /\b(trend|trending|over time|up or down|increas(?:e|ing)|decreas(?:e|ing))\b/i
const COMPARISON_REQUEST = /\b(compare|compared|comparison|versus|vs\.?|difference|than last|this week.*last week|this month.*last month)\b/i
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

const MONTH_NAME =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
const WEEKDAY_NAME =
  /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i

function hasUnparsedDateLanguage(text: string): boolean {
  return (
    /\b\d{4}-\d{2}-\d{2}\b/.test(text) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text) ||
    /\b\d{1,2}(?:st|nd|rd|th)\b/i.test(text) ||
    /\b(?:day|week|month|year)s?\s+ago\b/i.test(text) ||
    /\b(?:next|previous)\s+(?:day|week|month|year)\b/i.test(text) ||
    MONTH_NAME.test(text) ||
    WEEKDAY_NAME.test(text)
  )
}

function combinedRange(
  ranges: Array<{ startDate: string; endDate: string }>
): { startDate: string; endDate: string } | null {
  if (ranges.length < 2) return null
  return {
    startDate: ranges.reduce(
      (earliest, range) => range.startDate < earliest ? range.startDate : earliest,
      ranges[0].startDate
    ),
    endDate: ranges.reduce(
      (latest, range) => range.endDate > latest ? range.endDate : latest,
      ranges[0].endDate
    )
  }
}

function requestedComparisonRange(
  text: string,
  today: string
): { startDate: string; endDate: string } | null {
  const ranges: Array<{ startDate: string; endDate: string }> = []
  const thisWeek = startOfWeek(today)
  const lastMonth = previousMonth(today)
  let remaining = text

  if (/\bday before yesterday\b/i.test(remaining)) {
    const date = shiftIsoDate(today, -2)
    ranges.push({ startDate: date, endDate: date })
    remaining = remaining.replace(/\bday before yesterday\b/gi, '')
  }
  if (/\bnight before last\b/i.test(remaining)) {
    const date = shiftIsoDate(today, -1)
    ranges.push({ startDate: date, endDate: date })
    remaining = remaining.replace(/\bnight before last\b/gi, '')
  }
  if (/\byesterday\b/i.test(remaining) && /\bnight before\b/i.test(remaining)) {
    const yesterday = shiftIsoDate(today, -1)
    const nightBefore = shiftIsoDate(today, -2)
    ranges.push(
      { startDate: nightBefore, endDate: nightBefore },
      { startDate: yesterday, endDate: yesterday }
    )
    remaining = remaining
      .replace(/\byesterday\b/gi, '')
      .replace(/\b(?:the )?night before\b/gi, '')
  }
  if (/\byesterday\b/i.test(remaining)) {
    const date = shiftIsoDate(today, -1)
    ranges.push({ startDate: date, endDate: date })
  }
  if (/\b(?:today|tonight|last night)\b/i.test(remaining)) {
    ranges.push({ startDate: today, endDate: today })
  }
  if (/\blast week\b/i.test(remaining)) {
    ranges.push({
      startDate: shiftIsoDate(thisWeek, -7),
      endDate: shiftIsoDate(thisWeek, -1)
    })
  }
  if (/\bthis week\b/i.test(remaining)) {
    ranges.push({ startDate: thisWeek, endDate: today })
  }
  if (/\blast month\b/i.test(remaining)) {
    ranges.push({ startDate: lastMonth.start, endDate: lastMonth.end })
  }
  if (/\bthis month\b/i.test(remaining)) {
    ranges.push({ startDate: startOfMonth(today), endDate: today })
  }

  return combinedRange(ranges)
}

function requestedRange(
  text: string,
  today: string,
  mode: 'exact-value' | 'recent-range' | 'trend' | 'comparison'
): { startDate: string; endDate: string } | null {
  if (mode === 'comparison') return requestedComparisonRange(text, today)

  const exact = explicitDate(text)
  if (exact) return { startDate: exact, endDate: exact }
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
  if (/\bthis week\b/i.test(text) && /\blast week\b/i.test(text)) {
    return { startDate: shiftIsoDate(thisWeek, -7), endDate: today }
  }
  if (/\blast week\b/i.test(text)) {
    return { startDate: shiftIsoDate(thisWeek, -7), endDate: shiftIsoDate(thisWeek, -1) }
  }
  if (/\bthis week\b/i.test(text)) return { startDate: thisWeek, endDate: today }

  const lastMonth = previousMonth(today)
  if (/\bthis month\b/i.test(text) && /\blast month\b/i.test(text)) {
    return { startDate: lastMonth.start, endDate: today }
  }
  if (/\blast month\b/i.test(text)) return { startDate: lastMonth.start, endDate: lastMonth.end }
  if (/\bthis month\b/i.test(text)) return { startDate: startOfMonth(today), endDate: today }

  if (hasUnparsedDateLanguage(text)) return null
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
    if (/\b(ate|eaten|eat|intake|consum|food|nutrition)\b/i.test(text)) metrics.push('caloriesIn')
    else if (/\b(burn|burned|burnt|output|activity)\b/i.test(text)) metrics.push('caloriesOut')
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
  const trend = TREND_REQUEST.test(text)
  const exact = EXACT_REQUEST.test(text)
  const rangeLanguage =
    /\b(this|last|past|previous) (week|month)|\b(?:past|last) \d{1,3} days?\b/i.test(text)
  if (!comparison && !trend && !exact && !rangeLanguage) return null

  const reason: FastHealthPlan['reason'] = comparison
    ? 'comparison'
    : trend
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

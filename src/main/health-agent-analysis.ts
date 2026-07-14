export interface MetricSummary {
  observations: number
  missingDays: number
  mean: number | null
  min: number | null
  max: number | null
  first: { date: string; value: number } | null
  last: { date: string; value: number } | null
  changePct: number | null
  slopePerDay: number | null
}

export function summarizeMetricPoints(
  points: Array<{ date: string; value: number | null }>
): MetricSummary {
  const present = points.flatMap((point, index) =>
    point.value == null ? [] : [{ ...point, value: point.value, index }]
  )
  if (!present.length) {
    return {
      observations: 0,
      missingDays: points.length,
      mean: null,
      min: null,
      max: null,
      first: null,
      last: null,
      changePct: null,
      slopePerDay: null
    }
  }
  const values = present.map((point) => point.value)
  const xMean = present.reduce((sum, point) => sum + point.index, 0) / present.length
  const yMean = values.reduce((sum, value) => sum + value, 0) / values.length
  const numerator = present.reduce(
    (sum, point) => sum + (point.index - xMean) * (point.value - yMean),
    0
  )
  const denominator = present.reduce((sum, point) => sum + (point.index - xMean) ** 2, 0)
  const first = present[0]
  const last = present[present.length - 1]
  return {
    observations: present.length,
    missingDays: points.length - present.length,
    mean: yMean,
    min: Math.min(...values),
    max: Math.max(...values),
    first: { date: first.date, value: first.value },
    last: { date: last.date, value: last.value },
    changePct: first.value === 0 ? null : ((last.value - first.value) / Math.abs(first.value)) * 100,
    slopePerDay: denominator === 0 ? null : numerator / denominator
  }
}

export function pearsonCorrelation(pairs: Array<[number, number]>): number | null {
  if (pairs.length < 3) return null
  const xMean = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length
  const yMean = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length
  const numerator = pairs.reduce(
    (sum, pair) => sum + (pair[0] - xMean) * (pair[1] - yMean),
    0
  )
  const xVariance = pairs.reduce((sum, pair) => sum + (pair[0] - xMean) ** 2, 0)
  const yVariance = pairs.reduce((sum, pair) => sum + (pair[1] - yMean) ** 2, 0)
  const denominator = Math.sqrt(xVariance * yVariance)
  return denominator === 0 ? null : numerator / denominator
}

function civilClockTime(date: unknown, minute: unknown): string | null {
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof minute !== 'number' ||
    !Number.isFinite(minute)
  ) {
    return null
  }
  const normalizedSeconds = ((Math.round(minute * 60) % 86_400) + 86_400) % 86_400
  const hours = Math.floor(normalizedSeconds / 3_600)
  const minutes = Math.floor((normalizedSeconds % 3_600) / 60)
  return `${date} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function zonedClockTime(value: unknown, timeZone: string): string | null {
  if (typeof value !== 'string') return null
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(timestamp)
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

export function healthAgentModelData(
  name: string,
  data: Record<string, unknown>,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
): Record<string, unknown> {
  if (name === 'query_sleep') {
    const { detail, nights, ...rest } = data
    return {
      ...rest,
      nights: Array.isArray(nights)
        ? nights.map((candidate) => {
            const night = candidate as Record<string, unknown>
            const stages = Array.isArray(night.stages) ? night.stages : []
            const outOfBedSegments = Array.isArray(night.outOfBedSegments) ? night.outOfBedSegments : []
            const {
              stages: _stages,
              outOfBedSegments: _outOfBedSegments,
              startTime,
              endTime,
              startCivilDate,
              startCivilMinute,
              endCivilMinute,
              ...summary
            } = night
            const localStartTime =
              civilClockTime(startCivilDate, startCivilMinute) ?? zonedClockTime(startTime, timeZone)
            const localEndTime =
              civilClockTime(night.date, endCivilMinute) ?? zonedClockTime(endTime, timeZone)
            const localOutOfBedSegments = outOfBedSegments.flatMap((candidate) => {
              const segment = candidate as Record<string, unknown>
              const localSegmentStart = zonedClockTime(segment.startTime, timeZone)
              const localSegmentEnd = zonedClockTime(segment.endTime, timeZone)
              return localSegmentStart && localSegmentEnd
                ? [{ localStartTime: localSegmentStart, localEndTime: localSegmentEnd }]
                : []
            })
            return {
              ...summary,
              ...(localStartTime ? { localStartTime } : {}),
              ...(localEndTime ? { localEndTime } : {}),
              timeZone,
              stageSegmentCount: stages.length,
              ...(detail === 'detailed'
                ? { outOfBedSegments: localOutOfBedSegments }
                : { outOfBedSegmentCount: outOfBedSegments.length })
            }
          })
        : []
    }
  }
  if (name !== 'analyze_daily_metrics') return data
  const {
    days: _days,
    requestedRange: _requestedRange,
    units: _units,
    observations: _observations,
    ...compactData
  } = data
  return compactData
}

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

export function healthAgentModelData(name: string, data: Record<string, unknown>): Record<string, unknown> {
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
              ...summary
            } = night
            return {
              ...summary,
              stageSegmentCount: stages.length,
              ...(detail === 'detailed'
                ? { outOfBedSegments }
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

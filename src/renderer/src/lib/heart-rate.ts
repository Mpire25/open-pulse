export interface HeartRateSample {
  minute: number
  bpm: number
}

/**
 * Produces a stable visual series without changing the stored readings.
 * Legacy same-minute samples are distributed in their received order so no
 * readings disappear. Only series above the rendering cap are averaged.
 */
export function sampleHeartRateForChart(
  points: HeartRateSample[],
  maximumPoints: number,
  startMinute: number,
  endMinute: number
): HeartRateSample[] {
  if (points.length === 0) return []
  const sorted = [...points].sort((a, b) => a.minute - b.minute)
  const expanded: HeartRateSample[] = []

  for (let index = 0; index < sorted.length; ) {
    const minute = sorted[index].minute
    const group: HeartRateSample[] = []
    while (index < sorted.length && Math.abs(sorted[index].minute - minute) < 1e-6) {
      group.push(sorted[index])
      index += 1
    }
    const availableMinute = Math.max(1 / 60, Math.min(1, endMinute - minute))
    group.forEach((point, groupIndex) => {
      expanded.push({
        minute: group.length === 1 ? minute : minute + (availableMinute * groupIndex) / group.length,
        bpm: point.bpm
      })
    })
  }

  const target = Math.max(2, Math.floor(maximumPoints))
  if (expanded.length <= target) return expanded

  const span = Math.max(1 / 60, endMinute - startMinute)
  const buckets = Array.from({ length: target }, () => ({ minuteTotal: 0, bpmTotal: 0, count: 0 }))
  for (const point of expanded) {
    const position = (point.minute - startMinute) / span
    const bucketIndex = Math.min(target - 1, Math.max(0, Math.floor(position * target)))
    const bucket = buckets[bucketIndex]
    bucket.minuteTotal += point.minute
    bucket.bpmTotal += point.bpm
    bucket.count++
  }

  return buckets.flatMap((bucket) =>
    bucket.count > 0
      ? [{ minute: bucket.minuteTotal / bucket.count, bpm: Math.round(bucket.bpmTotal / bucket.count) }]
      : []
  )
}

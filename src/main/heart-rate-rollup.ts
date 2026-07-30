import type { HeartRatePoint } from '../shared/types'
import type { RollupPoint } from './health-api'

export const HEART_RATE_ROLLUP_WINDOW_SECONDS = 60

export function heartRatePointsFromRollups(points: RollupPoint[]): HeartRatePoint[] {
  return points
    .flatMap((point) => {
      const start = point.startTime ? new Date(point.startTime) : null
      const value = point.heartRate as
        | { beatsPerMinuteAvg?: number | string }
        | undefined
      const bpm = Number(value?.beatsPerMinuteAvg)

      if (!start || !Number.isFinite(start.getTime()) || !Number.isFinite(bpm) || bpm <= 0) return []

      return [{
        minute:
          start.getHours() * 60 +
          start.getMinutes() +
          start.getSeconds() / 60 +
          start.getMilliseconds() / 60_000,
        bpm: Math.round(bpm)
      }]
    })
    .sort((a, b) => a.minute - b.minute)
}

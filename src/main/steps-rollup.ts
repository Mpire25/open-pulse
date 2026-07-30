import type { HourlySteps } from '../shared/types'
import type { RollupPoint } from './health-api'

export const STEPS_ROLLUP_WINDOW_SECONDS = 60 * 60

export function hourlyStepsFromRollups(points: RollupPoint[]): HourlySteps[] {
  const hourly = new Array(24).fill(0) as number[]
  let sawValue = false

  for (const point of points) {
    const start = point.startTime ? new Date(point.startTime) : null
    const value = point.steps as { countSum?: number | string } | undefined
    const steps = Number(value?.countSum)

    if (
      !start ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(steps) ||
      steps < 0
    ) {
      continue
    }

    sawValue = true
    hourly[start.getHours()] += steps
  }

  return sawValue
    ? hourly.map((steps, hour) => ({ hour, steps: Math.round(steps) }))
    : []
}

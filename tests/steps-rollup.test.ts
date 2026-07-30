import { describe, expect, test } from 'bun:test'
import {
  STEPS_ROLLUP_WINDOW_SECONDS,
  hourlyStepsFromRollups
} from '../src/main/steps-rollup'

function localTime(hours: number): string {
  return new Date(2026, 6, 1, hours).toISOString()
}

describe('steps rollup normalization', () => {
  test('uses one-hour windows', () => {
    expect(STEPS_ROLLUP_WINDOW_SECONDS).toBe(60 * 60)
  })

  test('maps hourly sums into a complete 24-hour series', () => {
    const points = hourlyStepsFromRollups([
      { startTime: localTime(18), steps: { countSum: '420' } },
      { startTime: localTime(6), steps: { countSum: 125 } }
    ])

    expect(points).toHaveLength(24)
    expect(points[6]).toEqual({ hour: 6, steps: 125 })
    expect(points[12]).toEqual({ hour: 12, steps: 0 })
    expect(points[18]).toEqual({ hour: 18, steps: 420 })
  })

  test('combines repeated local hours and preserves a valid zero value', () => {
    const points = hourlyStepsFromRollups([
      { startTime: localTime(1), steps: { countSum: '100' } },
      { startTime: localTime(1), steps: { countSum: '50' } },
      { startTime: localTime(2), steps: { countSum: '0' } }
    ])

    expect(points).toHaveLength(24)
    expect(points[1]).toEqual({ hour: 1, steps: 150 })
    expect(points[2]).toEqual({ hour: 2, steps: 0 })
  })

  test('omits a series when every rollup window is malformed', () => {
    expect(
      hourlyStepsFromRollups([
        { startTime: 'not-a-date', steps: { countSum: '100' } },
        { startTime: localTime(2), steps: {} },
        { startTime: localTime(3), steps: { countSum: '-1' } }
      ])
    ).toEqual([])
  })
})

import { describe, expect, test } from 'bun:test'
import {
  HEART_RATE_ROLLUP_WINDOW_SECONDS,
  heartRatePointsFromRollups
} from '../src/main/heart-rate-rollup'

function localTime(hours: number, minutes: number): string {
  return new Date(2026, 6, 1, hours, minutes).toISOString()
}

describe('heart-rate rollup normalization', () => {
  test('uses one-minute windows', () => {
    expect(HEART_RATE_ROLLUP_WINDOW_SECONDS).toBe(60)
  })

  test('maps one average value per returned minute in local-time order', () => {
    const points = heartRatePointsFromRollups([
      {
        startTime: localTime(18, 2),
        heartRate: { beatsPerMinuteAvg: 93.6 }
      },
      {
        startTime: localTime(6, 15),
        heartRate: { beatsPerMinuteAvg: '67.2' }
      }
    ])

    expect(points).toEqual([
      { minute: 6 * 60 + 15, bpm: 67 },
      { minute: 18 * 60 + 2, bpm: 94 }
    ])
  })

  test('omits empty or malformed rollup windows', () => {
    expect(
      heartRatePointsFromRollups([
        { startTime: localTime(9, 0), heartRate: {} },
        { startTime: 'not-a-date', heartRate: { beatsPerMinuteAvg: 80 } },
        { startTime: localTime(9, 2), heartRate: { beatsPerMinuteAvg: 0 } }
      ])
    ).toEqual([])
  })
})

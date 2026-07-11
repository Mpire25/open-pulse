import { describe, expect, test } from 'bun:test'
import { parseHeartZones } from '../src/main/heart-detail'

describe('heart detail normalization', () => {
  test('combines zone thresholds, time, and calories', () => {
    const result = parseHeartZones(
      '2026-07-10',
      [
        {
          dailyHeartRateZones: {
            heartRateZones: [
              { heartRateZoneType: 'LIGHT', minBeatsPerMinute: '92', maxBeatsPerMinute: '116' }
            ]
          }
        }
      ],
      [
        {
          timeInHeartRateZone: {
            timeInHeartRateZones: [{ heartRateZone: 'LIGHT', duration: '2520s' }]
          }
        }
      ],
      [
        {
          caloriesInHeartRateZone: {
            caloriesInHeartRateZones: [{ heartRateZone: 'LIGHT', kcal: 168 }]
          }
        }
      ]
    )
    expect(result.zones[0]).toEqual({
      zone: 'light',
      minBpm: 92,
      maxBpm: 116,
      durationMin: 42,
      calories: 168
    })
  })
})

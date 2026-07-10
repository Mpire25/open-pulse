import { describe, expect, test } from 'bun:test'
import { parseHeartZones, parseVo2Detail } from '../src/main/heart-detail'

const bounds = {
  startTime: '2026-07-10T00:00:00Z',
  observedEndTime: '2026-07-10T02:00:00Z',
  dayEndTime: '2026-07-10T02:00:00Z'
}

describe('heart detail normalization', () => {
  test('retains VO2 samples and confidence metadata', () => {
    const result = parseVo2Detail(
      '2026-07-10',
      [
        {
          vo2Max: {
            sampleTime: { physicalTime: '2026-07-10T01:10:00Z' },
            vo2Max: 44.2,
            measurementMethod: 'FITBIT_RUN'
          }
        }
      ],
      [
        {
          dailyVo2Max: {
            cardioFitnessLevel: 'GOOD',
            estimated: false,
            vo2MaxCovariance: 0.34
          }
        }
      ],
      bounds,
      30
    )
    expect(result.points.filter((point) => point.value != null).map((point) => point.value)).toEqual([44.2])
    expect(result.stats.map((stat) => stat.value)).toEqual(['Good', 'Measured', '0.34', 'Fitbit Run'])
  })

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

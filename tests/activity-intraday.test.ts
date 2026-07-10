import { describe, expect, test } from 'bun:test'
import {
  activityRollupBreakdown,
  activityRollupPoints,
  activityRollupValue,
  calorieEnergyBreakdown
} from '../src/main/activity-intraday'
import type { RollupPoint } from '../src/main/health-api'

describe('activity intraday rollup normalization', () => {
  test('reads distance, calories, floors, and sedentary windows', () => {
    expect(activityRollupValue('distanceKm', { distance: { millimetersSum: '1250000' } })).toBe(1.25)
    expect(activityRollupValue('caloriesOut', { totalCalories: { kcalSum: 84.5 } })).toBe(84.5)
    expect(activityRollupValue('floors', { floors: { countSum: '3' } })).toBe(3)
    expect(activityRollupValue('sedentaryMinutes', { sedentaryPeriod: { durationSum: '1260s' } })).toBe(21)
  })

  test('keeps the daily active-minutes definition while retaining its richer breakdown', () => {
    const points: RollupPoint[] = [
      {
        activeMinutes: {
          activeMinutesRollupByActivityLevel: [
            { activityLevel: 'LIGHT', activeMinutesSum: '12' },
            { activityLevel: 'MODERATE', activeMinutesSum: '7' },
            { activityLevel: 'VIGOROUS', activeMinutesSum: '4' }
          ]
        }
      }
    ]
    expect(activityRollupValue('activeMinutes', points[0])).toBe(11)
    expect(activityRollupBreakdown('activeMinutes', points)).toEqual([
      { key: 'light', value: 12, unit: 'min' },
      { key: 'moderate', value: 7, unit: 'min' },
      { key: 'vigorous', value: 4, unit: 'min' }
    ])
  })

  test('sums active-zone windows and returns each zone separately', () => {
    const points: RollupPoint[] = [
      {
        activeZoneMinutes: {
          sumInFatBurnHeartZone: '5',
          sumInCardioHeartZone: '4',
          sumInPeakHeartZone: '2'
        }
      }
    ]
    expect(activityRollupValue('activeZoneMinutes', points[0])).toBe(11)
    expect(activityRollupBreakdown('activeZoneMinutes', points)).toEqual([
      { key: 'fatBurn', value: 5, unit: 'min' },
      { key: 'cardio', value: 4, unit: 'min' },
      { key: 'peak', value: 2, unit: 'min' }
    ])
  })

  test('separates total calories into active and basal energy', () => {
    expect(
      calorieEnergyBreakdown(
        [{ totalCalories: { kcalSum: 2400 } }],
        [{ activeEnergyBurned: { kcalSum: 820 } }]
      )
    ).toEqual([
      { key: 'activeEnergy', value: 820, unit: 'kcal' },
      { key: 'basalEnergy', value: 1580, unit: 'kcal' }
    ])
  })

  test('fills elapsed omitted windows with zero while leaving future windows empty', () => {
    const minute = (time: string): number => {
      const date = new Date(time)
      return date.getHours() * 60 + date.getMinutes()
    }
    expect(
      activityRollupPoints(
        'floors',
        [{ startTime: '2026-07-10T07:00:00Z', floors: { countSum: '2' } }],
        '2026-07-10T06:00:00Z',
        '2026-07-10T07:30:00Z',
        '2026-07-10T08:00:00Z',
        30
      )
    ).toEqual([
      { minute: minute('2026-07-10T06:00:00Z'), value: 0 },
      { minute: minute('2026-07-10T06:30:00Z'), value: 0 },
      { minute: minute('2026-07-10T07:00:00Z'), value: 2 },
      { minute: minute('2026-07-10T07:30:00Z'), value: null }
    ])
  })
})

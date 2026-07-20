import { describe, expect, test } from 'bun:test'
import type { Workout } from '../src/shared/types'
import { workoutDaySummaries, workoutTypeLabel, workoutTypeSummaries } from '../src/renderer/src/lib/workouts'

function workout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: 'workout-1',
    name: 'Morning walk',
    startTime: '2026-07-18T08:00:00Z',
    durationMin: 30,
    calories: 120,
    distanceKm: 2.5,
    avgHeartRate: 105,
    steps: 3_000,
    activeZoneMinutes: 20,
    ...overrides
  }
}

describe('workout overview analytics', () => {
  test('builds a continuous day-by-day history including rest days', () => {
    const result = workoutDaySummaries(
      [
        workout(),
        workout({ id: 'workout-2', startTime: '2026-07-20T18:00:00Z', durationMin: 45, calories: null })
      ],
      '2026-07-18',
      '2026-07-20'
    )

    expect(result).toEqual([
      { date: '2026-07-18', sessions: 1, durationMin: 30, calories: 120 },
      { date: '2026-07-19', sessions: 0, durationMin: 0, calories: 0 },
      { date: '2026-07-20', sessions: 1, durationMin: 45, calories: 0 }
    ])
  })

  test('uses exercise types for a duration-weighted training split', () => {
    const result = workoutTypeSummaries([
      workout({ exerciseType: 'WALKING', durationMin: 30 }),
      workout({ id: 'workout-2', exerciseType: 'WALKING', durationMin: 20 }),
      workout({ id: 'workout-3', exerciseType: 'STRENGTH_TRAINING', durationMin: 50 })
    ])

    expect(result).toEqual([
      { label: 'Walking', sessions: 2, durationMin: 50, share: 50 },
      { label: 'Strength Training', sessions: 1, durationMin: 50, share: 50 }
    ])
  })

  test('falls back to the display name when exercise type is unavailable', () => {
    expect(workoutTypeLabel(workout({ name: 'indoor-cycling', exerciseType: null }))).toBe('Indoor Cycling')
  })
})

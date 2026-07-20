import type { Workout } from '@shared/types'
import { listDates } from './metrics'

export interface WorkoutDaySummary {
  date: string
  sessions: number
  durationMin: number
  calories: number
}

export interface WorkoutTypeSummary {
  label: string
  sessions: number
  durationMin: number
  share: number
}

export function workoutDate(workout: Workout): string {
  return workout.startTime.slice(0, 10)
}

export function workoutTypeLabel(workout: Workout): string {
  const raw = workout.exerciseType?.trim() || workout.name.trim() || 'Activity'
  return raw
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function workoutDaySummaries(
  workouts: Workout[],
  start: string,
  end: string
): WorkoutDaySummary[] {
  const byDate = new Map<string, WorkoutDaySummary>()

  for (const date of listDates(start, end)) {
    byDate.set(date, { date, sessions: 0, durationMin: 0, calories: 0 })
  }

  for (const workout of workouts) {
    const summary = byDate.get(workoutDate(workout))
    if (!summary) continue
    summary.sessions += 1
    summary.durationMin += workout.durationMin
    summary.calories += workout.calories ?? 0
  }

  return [...byDate.values()]
}

export function workoutTypeSummaries(workouts: Workout[]): WorkoutTypeSummary[] {
  const byType = new Map<string, Omit<WorkoutTypeSummary, 'share'>>()

  for (const workout of workouts) {
    const label = workoutTypeLabel(workout)
    const current = byType.get(label) ?? { label, sessions: 0, durationMin: 0 }
    current.sessions += 1
    current.durationMin += workout.durationMin
    byType.set(label, current)
  }

  const values = [...byType.values()].sort(
    (a, b) => b.durationMin - a.durationMin || b.sessions - a.sessions || a.label.localeCompare(b.label)
  )
  const totalDuration = values.reduce((sum, value) => sum + value.durationMin, 0)
  const totalSessions = values.reduce((sum, value) => sum + value.sessions, 0)

  return values.map((value) => ({
    ...value,
    share:
      totalDuration > 0
        ? (value.durationMin / totalDuration) * 100
        : totalSessions > 0
          ? (value.sessions / totalSessions) * 100
          : 0
  }))
}

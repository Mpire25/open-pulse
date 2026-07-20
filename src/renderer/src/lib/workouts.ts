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

export interface DisplayedWorkoutType extends WorkoutTypeSummary {
  sourceLabels: string[]
}

export type WorkoutColorKey =
  | 'walking'
  | 'running'
  | 'strength'
  | 'cycling'
  | 'swimming'
  | 'mobility'
  | 'cardio'
  | 'tennis'
  | 'badminton'
  | 'football'
  | 'treadmill'
  | 'other'

export interface WorkoutTone {
  key: WorkoutColorKey
  color: string
  soft: string
}

const WORKOUT_COLORS: Record<WorkoutColorKey, string> = {
  walking: 'var(--color-workout-walking)',
  running: 'var(--color-workout-running)',
  strength: 'var(--color-workout-strength)',
  cycling: 'var(--color-workout-cycling)',
  swimming: 'var(--color-workout-swimming)',
  mobility: 'var(--color-workout-mobility)',
  cardio: 'var(--color-workout-cardio)',
  tennis: 'var(--color-workout-tennis)',
  badminton: 'var(--color-workout-badminton)',
  football: 'var(--color-workout-football)',
  treadmill: 'var(--color-workout-treadmill)',
  other: 'var(--color-workout-other)'
}

const WORKOUT_CATEGORY_LABELS: Record<WorkoutColorKey, string> = {
  walking: 'Walking',
  running: 'Running',
  strength: 'Strength Training',
  cycling: 'Cycling',
  swimming: 'Swimming',
  mobility: 'Mobility',
  cardio: 'Cardio',
  tennis: 'Tennis',
  badminton: 'Badminton',
  football: 'Football',
  treadmill: 'Treadmill',
  other: 'Other'
}

export function workoutTone(workout: Workout | string): WorkoutTone {
  const key = workoutColorKey(workoutText(workout))
  const color = WORKOUT_COLORS[key]
  return { key, color, soft: `color-mix(in oklab, ${color} 15%, transparent)` }
}

export function workoutCategoryLabel(workout: Workout | string): string {
  return WORKOUT_CATEGORY_LABELS[workoutColorKey(workoutText(workout))]
}

function workoutText(workout: Workout | string): string {
  return (
    typeof workout === 'string'
      ? workout
      : `${workout.exerciseType ?? ''} ${workout.name}`
  ).toLowerCase()
}

function workoutColorKey(text: string): WorkoutColorKey {
  if (/badminton|shuttlecock/.test(text)) return 'badminton'
  if (/tennis/.test(text)) return 'tennis'
  if (/football|soccer|futsal/.test(text)) return 'football'
  if (/treadmill/.test(text)) return 'treadmill'
  if (/swim|pool|aqua/.test(text)) return 'swimming'
  if (/cycl|bik|spin/.test(text)) return 'cycling'
  if (/strength|weight|resistance|crossfit|calisthen/.test(text)) return 'strength'
  if (/yoga|pilates|stretch|mobility|meditat/.test(text)) return 'mobility'
  if (/run|jog/.test(text)) return 'running'
  if (/walk|hik/.test(text)) return 'walking'
  if (/cardio|hiit|interval|aerobic|box|dance|elliptical|row|stair|climb/.test(text)) return 'cardio'
  return 'other'
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
    const label = workoutCategoryLabel(workout)
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

export function displayedWorkoutTypes(types: WorkoutTypeSummary[]): DisplayedWorkoutType[] {
  const visible = types.slice(0, 5).map((type) => ({ ...type, sourceLabels: [type.label] }))
  const overflow = types.slice(5)
  if (overflow.length === 0) return visible

  const visibleOther = visible.find((type) => type.label === 'Other')
  if (visibleOther) {
    return visible.map((type) =>
      type === visibleOther
        ? {
            ...type,
            sessions: type.sessions + overflow.reduce((sum, item) => sum + item.sessions, 0),
            durationMin: type.durationMin + overflow.reduce((sum, item) => sum + item.durationMin, 0),
            share: type.share + overflow.reduce((sum, item) => sum + item.share, 0),
            sourceLabels: [...type.sourceLabels, ...overflow.map((item) => item.label)]
          }
        : type
    )
  }

  return [
    ...visible,
    {
      label: 'Other',
      sessions: overflow.reduce((sum, type) => sum + type.sessions, 0),
      durationMin: overflow.reduce((sum, type) => sum + type.durationMin, 0),
      share: overflow.reduce((sum, type) => sum + type.share, 0),
      sourceLabels: overflow.map((type) => type.label)
    }
  ]
}

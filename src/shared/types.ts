// Types shared between the Electron main process and the renderer.

export type DataSource = 'demo' | 'live'

export type SleepStageType = 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM'

export interface SleepStageSegment {
  type: SleepStageType
  startTime: string // ISO
  endTime: string // ISO
}

export interface SleepNight {
  date: string // YYYY-MM-DD the night ended on
  startTime: string
  endTime: string
  minutesAsleep: number
  minutesInSleepPeriod: number
  efficiency: number | null // asleep / in-bed, 0-100
  isMainSleep: boolean
  stages: SleepStageSegment[]
  stageMinutes: Partial<Record<SleepStageType, number>>
}

/**
 * Everything we know about a single civil day. Every field is nullable:
 * absence means the tracker or the user simply didn't record it, and the UI
 * hides the corresponding section.
 */
export interface DayMetrics {
  date: string // YYYY-MM-DD
  // Activity
  steps: number | null
  distanceKm: number | null
  floors: number | null
  caloriesOut: number | null
  activeMinutes: number | null // moderate + vigorous
  activeZoneMinutes: number | null
  sedentaryMinutes: number | null
  // Heart & night signals
  restingHeartRate: number | null
  hrvMs: number | null
  spo2Pct: number | null
  breathingRate: number | null
  skinTempDeltaC: number | null // deviation from personal baseline
  vo2Max: number | null
  // Sleep summary
  sleepMinutes: number | null
  sleepEfficiency: number | null
  // Body & intake
  weightKg: number | null
  bodyFatPct: number | null
  waterMl: number | null
  caloriesIn: number | null
}

export interface HourlySteps {
  hour: number // 0-23
  steps: number
}

export interface HeartRatePoint {
  minute: number // minute of day, 0-1439
  bpm: number
}

export interface Workout {
  id: string
  name: string
  startTime: string // ISO
  durationMin: number
  calories: number | null
  distanceKm: number | null
  avgHeartRate: number | null
  steps: number | null
  activeZoneMinutes: number | null
}

/** Full snapshot for a selected date, including its 14-day trend window. */
export interface HealthDay {
  date: string // YYYY-MM-DD
  source: DataSource
  syncedAt: string // ISO
  metrics: DayMetrics
  stepsHourly: HourlySteps[]
  heartRate: HeartRatePoint[]
  currentHeartRate: number | null // only set when date is today
  sleep: SleepNight | null
  workouts: Workout[]
  /** Daily metrics for the 14 days ending on `date`, oldest first. */
  trend: DayMetrics[]
}

export interface Goals {
  steps: number
  activeZoneMinutes: number
  caloriesOut: number
  sleepMinutes: number
}

export const DEFAULT_GOALS: Goals = {
  steps: 10000,
  activeZoneMinutes: 30,
  caloriesOut: 2600,
  sleepMinutes: 8 * 60
}

export interface AppSettings {
  googleClientId: string
  googleClientSecret: string
  googleClientSecretConfigured: boolean
  goals: Goals
}

export interface GoogleAuthStatus {
  connected: boolean
  email?: string
}

export interface CodexAuthStatus {
  connected: boolean
  email?: string
  planType?: string
}

export interface PairedDevice {
  name: string
  model: string
  type?: string | null
  batteryPct?: number | null
  batteryState?: string | null
  lastSync?: string | null
  features?: string[]
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  text: string
}

export type AiEvent =
  | { type: 'delta'; chatId: string; text: string }
  | { type: 'reasoning'; chatId: string }
  | { type: 'tool'; chatId: string; name: string; label: string }
  | { type: 'done'; chatId: string; text: string }
  | { type: 'error'; chatId: string; message: string }

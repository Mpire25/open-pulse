// Types shared between the Electron main process and the renderer.

export type DataSource = 'demo' | 'live'

// ---------------------------------------------------------------------------
// Daily metrics
//
// Everything the app charts by day is one of these keys. The main process
// stores values per (metric, day) so queries can reuse any day that another
// view — or a previous session — already synced.

export const METRIC_KEYS = [
  // Activity
  'steps',
  'distanceKm',
  'floors',
  'caloriesOut',
  'activeMinutes',
  'activeZoneMinutes',
  'sedentaryMinutes',
  // Heart & night signals
  'restingHeartRate',
  'hrvMs',
  'spo2Pct',
  'breathingRate',
  'skinTempDeltaC',
  'vo2Max',
  // Sleep summary (derived from sleep sessions)
  'sleepMinutes',
  'sleepEfficiency',
  // Body
  'weightKg',
  'bodyFatPct',
  // Nutrition & intake
  'waterMl',
  'caloriesIn',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'saturatedFatG',
  'sodiumG',
  'sugarG'
] as const

export type MetricKey = (typeof METRIC_KEYS)[number]

/** One civil day's recorded values. Missing or null = the tracker/user didn't log it. */
export type DayValues = Partial<Record<MetricKey, number | null>>

/** date (YYYY-MM-DD) -> that day's values, one entry per day in the queried range. */
export type DailySeries = Record<string, DayValues>

export interface SeriesResult {
  source: DataSource
  start: string
  end: string
  days: DailySeries
}

// ---------------------------------------------------------------------------
// Sleep

export type SleepStageType = 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM'

export interface SleepStageSegment {
  type: SleepStageType
  startTime: string // ISO
  endTime: string // ISO
}

export interface SleepOutOfBedSegment {
  startTime: string
  endTime: string
}

export interface SleepRespiratoryStageStats {
  breathsPerMinute: number
  standardDeviation: number | null
  signalToNoise: number | null
}

export interface SleepRespiratorySummary {
  full: SleepRespiratoryStageStats | null
  light: SleepRespiratoryStageStats | null
  deep: SleepRespiratoryStageStats | null
  rem: SleepRespiratoryStageStats | null
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
  stageCounts: Partial<Record<SleepStageType, number>>
  minutesAwake: number | null
  minutesToFirstDeepOrRem: number | null
  deepRemMinutes: number
  interruptionMinutes: number
  interruptionCount: number
  minutesToFallAsleep: number | null
  minutesAfterWakeUp: number | null
  outOfBedSegments: SleepOutOfBedSegment[]
  sleepType: string | null
  processed: boolean | null
  manuallyEdited: boolean | null
  stagesStatus: string | null
  respiratory: SleepRespiratorySummary | null
}

export interface SleepRangeResult {
  source: DataSource
  nights: SleepNight[]
}

// ---------------------------------------------------------------------------
// Intraday & sessions

export interface HourlySteps {
  hour: number // 0-23
  steps: number
}

export interface HeartRatePoint {
  minute: number // minute of day, 0-1439
  bpm: number
}

export interface IntradaySnapshot {
  date: string
  source: DataSource
  stepsHourly: HourlySteps[]
  heartRate: HeartRatePoint[]
  currentHeartRate: number | null // only set when date is today
}

export const ACTIVITY_INTRADAY_METRICS = [
  'distanceKm',
  'caloriesOut',
  'floors',
  'activeMinutes',
  'activeZoneMinutes',
  'sedentaryMinutes'
] as const satisfies readonly MetricKey[]

export type ActivityIntradayMetric = (typeof ACTIVITY_INTRADAY_METRICS)[number]

export function isActivityIntradayMetric(value: string): value is ActivityIntradayMetric {
  return ACTIVITY_INTRADAY_METRICS.some((metric) => metric === value)
}

export interface ActivityIntradayPoint {
  minute: number // local minute of day at the start of the aggregation window
  value: number | null // null means the device supplied no value for this window
}

export interface ActivityIntradayBreakdown {
  key: 'light' | 'moderate' | 'vigorous' | 'fatBurn' | 'cardio' | 'peak' | 'activeEnergy' | 'basalEnergy'
  value: number
  unit: 'min' | 'kcal'
}

export interface ActivityIntradayResult {
  date: string
  source: DataSource
  metric: ActivityIntradayMetric
  windowMinutes: number
  points: ActivityIntradayPoint[]
  breakdown: ActivityIntradayBreakdown[]
}

export const HEART_DETAIL_METRICS = [
  'restingHeartRate',
  'vo2Max'
] as const satisfies readonly MetricKey[]

export type HeartDetailMetric = (typeof HEART_DETAIL_METRICS)[number]

export function isHeartDetailMetric(value: string): value is HeartDetailMetric {
  return HEART_DETAIL_METRICS.some((metric) => metric === value)
}

export interface HeartDetailPoint {
  minute: number
  value: number | null
}

export interface HeartDetailStat {
  key: string
  label: string
  value: string
  unit?: string
}

export interface HeartZoneDetail {
  zone: 'light' | 'moderate' | 'vigorous' | 'peak'
  minBpm: number | null
  maxBpm: number | null
  durationMin: number | null
  calories: number | null
}

export interface HeartDetailResult {
  date: string
  source: DataSource
  metric: HeartDetailMetric
  windowMinutes: number
  points: HeartDetailPoint[]
  sampleLabel?: string
  sampleUnit?: string
  stats: HeartDetailStat[]
  zones: HeartZoneDetail[]
}

export interface Workout {
  id: string
  name: string
  startTime: string // ISO
  startMinute?: number | null // civil minute of day where the workout was recorded
  durationMin: number
  elapsedDurationMin?: number | null
  exerciseType?: string | null
  calories: number | null
  distanceKm: number | null
  avgHeartRate: number | null
  steps: number | null
  activeZoneMinutes: number | null
  averageSpeedKph?: number | null
  averagePaceSecPerKm?: number | null
  elevationGainM?: number | null
  runVo2Max?: number | null
  totalSwimLengths?: number | null
  heartRateZones?: WorkoutHeartRateZones | null
  mobility?: WorkoutMobilityMetrics | null
  splits?: WorkoutSplit[]
  events?: WorkoutEvent[]
  hasGps?: boolean | null
  poolLengthM?: number | null
  notes?: string | null
  recordingSource?: string | null
  deviceName?: string | null
}

export interface WorkoutHeartRateZones {
  lightMin: number | null
  moderateMin: number | null
  vigorousMin: number | null
  peakMin: number | null
}

export interface WorkoutMobilityMetrics {
  groundContactMs: number | null
  cadenceStepsPerMin: number | null
  strideLengthM: number | null
  verticalOscillationCm: number | null
  verticalRatio: number | null
}

export interface WorkoutSplit {
  startTime: string
  endTime: string
  durationMin: number
  splitType: string | null
  calories: number | null
  distanceKm: number | null
  steps: number | null
  avgHeartRate: number | null
  averageSpeedKph: number | null
  averagePaceSecPerKm: number | null
  elevationGainM: number | null
}

export interface WorkoutEvent {
  time: string
  type: string
  minute?: number | null
}

export interface WorkoutTrackPoint {
  time: string | null
  latitude: number | null
  longitude: number | null
  altitudeM: number | null
  heartRate: number | null
  cadence: number | null
}

export interface WorkoutTrackResult {
  points: WorkoutTrackPoint[]
}

export interface WorkoutsResult {
  source: DataSource
  workouts: Workout[]
}

export interface NutritionLogEntry {
  id: string
  startTime: string
  endTime: string
  foodName: string
  mealType: string | null
  servingLabel: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  saturatedFatG: number | null
  sodiumG: number | null
  sugarG: number | null
}

export interface NutritionLogsResult {
  date: string
  source: DataSource
  entries: NutritionLogEntry[]
}

export interface BodyMeasurement {
  id: string
  time: string
  weightKg: number | null
  bodyFatPct: number | null
  notes: string | null
}

export interface BodyMeasurementsResult {
  source: DataSource
  measurements: BodyMeasurement[]
}

// ---------------------------------------------------------------------------
// AI snapshot (assistant tools want one self-describing day blob)

export type DayMetrics = { date: string } & Record<MetricKey, number | null>

export interface HealthDay {
  date: string
  source: DataSource
  syncedAt: string // ISO
  metrics: DayMetrics
  stepsHourly: HourlySteps[]
  heartRate: HeartRatePoint[]
  currentHeartRate: number | null
  sleep: SleepNight | null
  workouts: Workout[]
  /** Daily metrics for the 14 days ending on `date`, oldest first. */
  trend: DayMetrics[]
}

// ---------------------------------------------------------------------------
// Sync activity (renderer shows a live indicator while API calls are queued)

export interface SyncActivity {
  pending: number
}

// ---------------------------------------------------------------------------
// Settings, auth, devices

export interface Goals {
  steps: number
  activeZoneMinutes: number
  caloriesOut: number
  caloriesIn: number
  proteinG: number
  carbsG: number
  fatG: number
  sleepMinutes: number
}

export const DEFAULT_GOALS: Goals = {
  steps: 10000,
  activeZoneMinutes: 30,
  caloriesOut: 2600,
  caloriesIn: 2200,
  proteinG: 150,
  carbsG: 250,
  fatG: 70,
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

// ---------------------------------------------------------------------------
// Chat

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

// Types shared between the Electron main process and the renderer.

export interface RingMetric {
  current: number
  goal: number
}

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
  stages: SleepStageSegment[]
  stageMinutes: Partial<Record<SleepStageType, number>>
}

export interface HeartSample {
  time: string // ISO
  bpm: number
}

export interface DashboardToday {
  date: string // YYYY-MM-DD
  steps: RingMetric
  activeZoneMinutes: RingMetric
  activeEnergyKcal: RingMetric
  distanceKm: number
  floors: number
  restingHeartRate: number | null
  currentHeartRate: number | null
  heartRateSeries: HeartSample[]
  hrvMs: number | null
  spo2Pct: number | null
  breathingRate: number | null
  sleep: SleepNight | null
  source: 'demo' | 'live'
}

export interface DaySummary {
  date: string
  steps: number
  activeZoneMinutes: number
  activeEnergyKcal: number
  distanceKm: number
  sleepMinutes: number
  restingHeartRate: number | null
  hrvMs: number | null
}

export interface WeekSeries {
  days: DaySummary[]
  source: 'demo' | 'live'
}

export interface Goals {
  steps: number
  activeZoneMinutes: number
  activeEnergyKcal: number
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
  batteryPct?: number
  lastSync?: string
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

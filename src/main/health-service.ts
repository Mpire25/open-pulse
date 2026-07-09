// Produces renderer-facing health data, from the Google Health API when
// connected and from the demo generator otherwise.

import type {
  DashboardToday,
  HeartSample,
  PairedDevice,
  SleepNight,
  SleepStageSegment,
  SleepStageType,
  WeekSeries
} from '../shared/types'
import { getGoogleAccessToken } from './google-auth'
import { dailyRollUp, listDataPoints, listPairedDevices, type RawDataPoint } from './health-api'
import { demoDashboard, demoSleepHistory, demoWeek } from './sample-data'
import { getSettings } from './store'

function isoDate(d: Date): string {
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function shiftDays(base: Date, days: number): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

// Live data when a Google access token is available, demo data otherwise.
async function liveToken(): Promise<string | null> {
  return getGoogleAccessToken()
}

// ---------------------------------------------------------------------------
// Raw data-point mapping

interface RawSleep {
  interval?: { startTime?: string; endTime?: string }
  stages?: Array<{ type?: string; startTime?: string; endTime?: string }>
  summary?: {
    minutesAsleep?: string
    minutesInSleepPeriod?: string
    stagesSummary?: Array<{ type?: string; totalMinutes?: string }>
  }
}

const STAGE_MAP: Record<string, SleepStageType> = {
  AWAKE: 'AWAKE',
  RESTLESS: 'AWAKE',
  LIGHT: 'LIGHT',
  ASLEEP: 'LIGHT',
  DEEP: 'DEEP',
  REM: 'REM'
}

function mapSleep(point: RawDataPoint): SleepNight | null {
  const sleep = point.sleep as RawSleep | undefined
  if (!sleep?.interval?.startTime || !sleep.interval.endTime) return null
  const stages: SleepStageSegment[] = (sleep.stages ?? [])
    .filter((s) => s.startTime && s.endTime && STAGE_MAP[s.type ?? ''])
    .map((s) => ({ type: STAGE_MAP[s.type!], startTime: s.startTime!, endTime: s.endTime! }))
  const stageMinutes: Partial<Record<SleepStageType, number>> = {}
  for (const seg of stages) {
    const minutes = (new Date(seg.endTime).getTime() - new Date(seg.startTime).getTime()) / 60_000
    stageMinutes[seg.type] = Math.round((stageMinutes[seg.type] ?? 0) + minutes)
  }
  const end = new Date(sleep.interval.endTime)
  return {
    date: isoDate(end),
    startTime: sleep.interval.startTime,
    endTime: sleep.interval.endTime,
    minutesAsleep: Number(sleep.summary?.minutesAsleep ?? 0),
    minutesInSleepPeriod: Number(sleep.summary?.minutesInSleepPeriod ?? 0),
    stages,
    stageMinutes
  }
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Pulls the first numeric field out of a rollup value object, so we tolerate
// small naming differences across data types (countSum, minutesSum, ...).
function firstNumber(obj: unknown): number {
  if (obj == null) return 0
  if (typeof obj === 'number' || typeof obj === 'string') return num(obj)
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const n = firstNumber(v)
      if (n) return n
    }
  }
  return 0
}

// ---------------------------------------------------------------------------
// Public service

export async function getDashboardToday(): Promise<DashboardToday> {
  const goals = getSettings().goals
  const token = await liveToken()
  if (!token) return demoDashboard(goals)

  try {
    const now = new Date()
    const today = isoDate(now)
    const tomorrow = isoDate(shiftDays(now, 1))
    const startOfDay = new Date(`${today}T00:00:00`)

    const [stepsRoll, azmRoll, energyRoll, distanceRoll, floorsRoll] = await Promise.all([
      dailyRollUp(token, 'steps', today, tomorrow),
      dailyRollUp(token, 'active-zone-minutes', today, tomorrow),
      dailyRollUp(token, 'active-energy-burned', today, tomorrow),
      dailyRollUp(token, 'distance', today, tomorrow),
      dailyRollUp(token, 'floors', today, tomorrow)
    ])

    const [hrPoints, rhrPoints, hrvPoints, spo2Points, brPoints, sleepPoints] = await Promise.all([
      listDataPoints(token, 'heart-rate', startOfDay.toISOString(), now.toISOString()),
      listDataPoints(token, 'daily-resting-heart-rate', shiftDays(now, -3).toISOString(), now.toISOString()),
      listDataPoints(token, 'daily-heart-rate-variability', shiftDays(now, -3).toISOString(), now.toISOString()),
      listDataPoints(token, 'daily-oxygen-saturation', shiftDays(now, -3).toISOString(), now.toISOString()),
      listDataPoints(token, 'daily-respiratory-rate', shiftDays(now, -3).toISOString(), now.toISOString()),
      listDataPoints(token, 'sleep', shiftDays(now, -1.5 as number).toISOString(), now.toISOString())
    ])

    const heartRateSeries: HeartSample[] = hrPoints
      .map((p) => {
        const hr = p.heartRate as
          | { sampleTime?: { physicalTime?: string }; beatsPerMinute?: string }
          | undefined
        return hr?.sampleTime?.physicalTime
          ? { time: hr.sampleTime.physicalTime, bpm: num(hr.beatsPerMinute) }
          : null
      })
      .filter((s): s is HeartSample => s !== null)
      .sort((a, b) => a.time.localeCompare(b.time))

    const latest = <T>(points: RawDataPoint[], key: string): T | undefined =>
      points.length ? (points[points.length - 1][key] as T) : undefined

    const rhr = latest<{ beatsPerMinute?: string }>(rhrPoints, 'dailyRestingHeartRate')
    const hrv = latest<{ averageHeartRateVariabilityMilliseconds?: number }>(
      hrvPoints,
      'dailyHeartRateVariability'
    )
    const spo2 = latest<{ averagePercentage?: number }>(spo2Points, 'dailyOxygenSaturation')
    const br = latest<{ breathsPerMinute?: number; averageBreathsPerMinute?: number }>(
      brPoints,
      'dailyRespiratoryRate'
    )

    const sleepNights = sleepPoints.map(mapSleep).filter((s): s is SleepNight => s !== null)

    return {
      date: today,
      steps: { current: firstNumber(stepsRoll[0]?.steps), goal: goals.steps },
      activeZoneMinutes: { current: firstNumber(azmRoll[0]?.activeZoneMinutes), goal: goals.activeZoneMinutes },
      activeEnergyKcal: {
        current: Math.round(firstNumber(energyRoll[0]?.activeEnergyBurned)),
        goal: goals.activeEnergyKcal
      },
      distanceKm: +(firstNumber(distanceRoll[0]?.distance) / 1000).toFixed(2),
      floors: firstNumber(floorsRoll[0]?.floors),
      restingHeartRate: rhr ? num(rhr.beatsPerMinute) : null,
      currentHeartRate: heartRateSeries.at(-1)?.bpm ?? null,
      heartRateSeries,
      hrvMs: hrv?.averageHeartRateVariabilityMilliseconds ?? null,
      spo2Pct: spo2?.averagePercentage ?? null,
      breathingRate: br?.breathsPerMinute ?? br?.averageBreathsPerMinute ?? null,
      sleep: sleepNights.at(-1) ?? null,
      source: 'live'
    }
  } catch (err) {
    console.error('[health] live dashboard failed, serving demo data:', err)
    return demoDashboard(goals)
  }
}

export async function getWeekSeries(): Promise<WeekSeries> {
  const token = await liveToken()
  if (!token) return demoWeek()

  try {
    const now = new Date()
    const end = isoDate(shiftDays(now, 1))
    const start = isoDate(shiftDays(now, -6))

    const [stepsRoll, azmRoll, energyRoll, distanceRoll, rhrPoints, hrvPoints, sleepPoints] =
      await Promise.all([
        dailyRollUp(token, 'steps', start, end),
        dailyRollUp(token, 'active-zone-minutes', start, end),
        dailyRollUp(token, 'active-energy-burned', start, end),
        dailyRollUp(token, 'distance', start, end),
        listDataPoints(token, 'daily-resting-heart-rate', shiftDays(now, -7).toISOString(), now.toISOString()),
        listDataPoints(token, 'daily-heart-rate-variability', shiftDays(now, -7).toISOString(), now.toISOString()),
        listDataPoints(token, 'sleep', shiftDays(now, -7).toISOString(), now.toISOString())
      ])

    const byDate = <T extends { civilStartTime?: { date?: { year?: number; month?: number; day?: number } } }>(
      points: T[]
    ): Map<string, T> => {
      const map = new Map<string, T>()
      for (const p of points) {
        const d = p.civilStartTime?.date
        if (d?.year) {
          map.set(
            `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
            p
          )
        }
      }
      return map
    }

    const stepsBy = byDate(stepsRoll)
    const azmBy = byDate(azmRoll)
    const energyBy = byDate(energyRoll)
    const distanceBy = byDate(distanceRoll)
    const sleepNights = sleepPoints.map(mapSleep).filter((s): s is SleepNight => s !== null)

    const days = [] as WeekSeries['days']
    for (let i = 6; i >= 0; i--) {
      const date = isoDate(shiftDays(now, -i))
      const sleepNight = sleepNights.find((s) => s.date === date)
      const rhrPoint = rhrPoints.find((p) => {
        const d = (p.dailyRestingHeartRate as { date?: { year?: number; month?: number; day?: number } })
          ?.date
        return (
          d &&
          `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` === date
        )
      })
      const hrvPoint = hrvPoints.find((p) => {
        const d = (p.dailyHeartRateVariability as { date?: { year?: number; month?: number; day?: number } })
          ?.date
        return (
          d &&
          `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` === date
        )
      })
      days.push({
        date,
        steps: firstNumber(stepsBy.get(date)?.steps),
        activeZoneMinutes: firstNumber(azmBy.get(date)?.activeZoneMinutes),
        activeEnergyKcal: Math.round(firstNumber(energyBy.get(date)?.activeEnergyBurned)),
        distanceKm: +(firstNumber(distanceBy.get(date)?.distance) / 1000).toFixed(2),
        sleepMinutes: sleepNight?.minutesAsleep ?? 0,
        restingHeartRate: rhrPoint
          ? num((rhrPoint.dailyRestingHeartRate as { beatsPerMinute?: string }).beatsPerMinute)
          : null,
        hrvMs: hrvPoint
          ? ((hrvPoint.dailyHeartRateVariability as { averageHeartRateVariabilityMilliseconds?: number })
              .averageHeartRateVariabilityMilliseconds ?? null)
          : null
      })
    }
    return { days, source: 'live' }
  } catch (err) {
    console.error('[health] live week failed, serving demo data:', err)
    return demoWeek()
  }
}

export async function getSleepHistory(nights: number): Promise<SleepNight[]> {
  const token = await liveToken()
  if (!token) return demoSleepHistory(nights)
  try {
    const now = new Date()
    const points = await listDataPoints(token, 'sleep', shiftDays(now, -nights).toISOString(), now.toISOString())
    const mapped = points.map(mapSleep).filter((s): s is SleepNight => s !== null)
    return mapped.length ? mapped : demoSleepHistory(nights)
  } catch (err) {
    console.error('[health] sleep history failed, serving demo data:', err)
    return demoSleepHistory(nights)
  }
}

export async function getDevices(): Promise<PairedDevice[]> {
  const token = await liveToken()
  if (!token) {
    return [
      { name: 'Fitbit Air', model: 'Google Fitbit Air', batteryPct: 76, lastSync: new Date().toISOString() }
    ]
  }
  try {
    const devices = await listPairedDevices(token)
    return devices.map((d) => ({
      name: d.displayName ?? d.model ?? 'Tracker',
      model: d.model ?? 'Unknown model',
      batteryPct: d.batteryLevelPercentage,
      lastSync: d.lastSyncTime
    }))
  } catch (err) {
    console.error('[health] devices failed:', err)
    return []
  }
}

// A deterministic synthetic health history for the assistant evals.
//
// Every value is a pure function of "days ago", so the same question gets the
// same data on any run date. The history has deliberate stories the cases ask
// about:
// - Weight is flat at ~74 kg, then rises ~3 kg over the last 75 days.
// - Food intake rises ~420 kcal/day 80 days ago (an evening snack appears),
//   and running drops from three runs a week to one, so steps fall too.
// - The last 14 nights are short and fragmented; resting heart rate rises and
//   HRV falls over the same fortnight.
// - The tracker was not worn 40–44 days ago: no activity, heart or sleep data
//   (nutrition and weight were still logged by hand).
// - Today is partial: 4,213 steps so far and only breakfast logged.
// - Yesterday was a run at 07:00, then porridge at 08:30 and a chicken burrito
//   for lunch.

import type {
  BodyMeasurement,
  BodyMeasurementsResult,
  DayValues,
  HourlySteps,
  HeartRatePoint,
  IntradaySnapshot,
  MetricKey,
  NutritionLogEntry,
  NutritionLogsResult,
  PairedDevice,
  SeriesResult,
  SleepDay,
  SleepNight,
  SleepRangeResult,
  SleepStageSegment,
  Workout,
  WorkoutsResult
} from '../src/shared/types'

export const HISTORY_DAYS = 400
export const GAP = { from: 44, to: 40 } as const
export const LATE_PHASE_DAYS = 80
export const WEIGHT_RISE_DAYS = 75
export const RECENT_DAYS = 14
export const TODAY_STEPS = 4213
export const HEIGHT_CM = 178
export const BATTERY_PCT = 64

// ---------------------------------------------------------------------------
// Dates

// The eval's "today". Live runs pin it when they start, so every case sees the
// same day; rescoring pins it to the original run's start so a saved answer is
// judged against the dates it was given, not the dates on the day it is rescored.
let pinnedNow: number | null = null

export function pinEvalNow(at: Date | null): void {
  pinnedNow = at ? at.getTime() : null
}

export function evalNow(): Date {
  return pinnedNow == null ? new Date() : new Date(pinnedNow)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The local civil date `daysAgo` days before today. */
export function dateAgo(daysAgo: number, now = evalNow()): string {
  return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, 12))
}

/** Days between a local civil date and today (0 = today, negative = future). */
export function daysAgoOf(date: string, now = evalNow()): number {
  const [year, month, day] = date.split('-').map(Number)
  const target = Date.UTC(year, month - 1, day)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - target) / 86_400_000)
}

export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = []
  const [year, month, day] = start.split('-').map(Number)
  for (let i = 0; i < 1000; i++) {
    const date = isoDay(new Date(year, month - 1, day + i, 12))
    if (date > end) break
    dates.push(date)
  }
  return dates
}

/** ISO instant for a local wall-clock time on the day `daysAgo` days before today. */
function localInstant(daysAgo: number, minuteOfDay: number, now = evalNow()): string {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysAgo,
    0,
    minuteOfDay
  ).toISOString()
}

// ---------------------------------------------------------------------------
// Deterministic noise

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** A stable pseudo-random value in [-1, 1] for (key, day). */
function noise(key: string, daysAgo: number): number {
  let t = hash(`${key}:${daysAgo}`) + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1
}

function round(value: number, places = 0): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

// ---------------------------------------------------------------------------
// Stories

export function inHistory(daysAgo: number): boolean {
  return daysAgo >= 0 && daysAgo <= HISTORY_DAYS
}

export function trackerWorn(daysAgo: number): boolean {
  return inHistory(daysAgo) && !(daysAgo >= GAP.to && daysAgo <= GAP.from)
}

export function isRunDay(daysAgo: number): boolean {
  if (!trackerWorn(daysAgo) || daysAgo === 0) return false
  const slot = daysAgo % 7
  return daysAgo <= LATE_PHASE_DAYS ? slot === 1 : slot === 1 || slot === 3 || slot === 5
}

export function isWeighDay(daysAgo: number): boolean {
  return inHistory(daysAgo) && [0, 2, 4, 5].includes(daysAgo % 7)
}

function recentShare(daysAgo: number): number {
  return daysAgo < RECENT_DAYS ? (RECENT_DAYS - daysAgo) / RECENT_DAYS : 0
}

export function weightKg(daysAgo: number): number | null {
  if (!isWeighDay(daysAgo)) return null
  const rise = daysAgo <= WEIGHT_RISE_DAYS ? ((WEIGHT_RISE_DAYS - daysAgo) / WEIGHT_RISE_DAYS) * 3 : 0
  return round(74 + rise + noise('weight', daysAgo) * 0.25, 1)
}

function bodyFatPct(daysAgo: number): number | null {
  if (!isWeighDay(daysAgo)) return null
  const rise = daysAgo <= WEIGHT_RISE_DAYS ? ((WEIGHT_RISE_DAYS - daysAgo) / WEIGHT_RISE_DAYS) * 1.5 : 0
  return round(21.5 + rise + noise('fat', daysAgo) * 0.3, 1)
}

interface RunSummary {
  startMinute: number
  durationMin: number
  distanceKm: number
  avgHeartRate: number
  calories: number
  steps: number
}

export function runOn(daysAgo: number): RunSummary | null {
  if (!isRunDay(daysAgo)) return null
  if (daysAgo === 1) {
    return { startMinute: 7 * 60, durationMin: 34, distanceKm: 6.2, avgHeartRate: 152, calories: 430, steps: 5600 }
  }
  const durationMin = round(34 + noise('run-duration', daysAgo) * 6)
  const distanceKm = round(durationMin / 5.5, 1)
  return {
    startMinute: 7 * 60,
    durationMin,
    distanceKm,
    avgHeartRate: round(150 + noise('run-hr', daysAgo) * 4),
    calories: round(distanceKm * 70),
    steps: round(distanceKm * 900)
  }
}

export function steps(daysAgo: number): number | null {
  if (!trackerWorn(daysAgo)) return null
  if (daysAgo === 0) return TODAY_STEPS
  const base = daysAgo <= LATE_PHASE_DAYS ? 7800 : 9600
  return round(base + noise('steps', daysAgo) * 1200 + (runOn(daysAgo)?.steps ?? 0))
}

export function restingHeartRate(daysAgo: number): number | null {
  if (!trackerWorn(daysAgo)) return null
  return round(58 + recentShare(daysAgo) * 4 + noise('rhr', daysAgo) * 1)
}

export function hrvMs(daysAgo: number): number | null {
  if (!trackerWorn(daysAgo)) return null
  return round((daysAgo < RECENT_DAYS ? 38 : 48) + noise('hrv', daysAgo) * 4)
}

interface NightSummary {
  bedMinute: number // minutes after midnight of the evening before (may exceed 1440)
  minutesInSleepPeriod: number
  minutesAsleep: number
  deep: number
  rem: number
  light: number
  awake: number
}

/** The main sleep for the night that ended `daysAgo` days ago. */
export function night(daysAgo: number): NightSummary | null {
  if (!trackerWorn(daysAgo)) return null
  const recent = daysAgo < RECENT_DAYS
  const minutesAsleep = round((recent ? 365 : 440) + noise('sleep', daysAgo) * (recent ? 20 : 25))
  const efficiency = (recent ? 84 : 91) + noise('efficiency', daysAgo) * (recent ? 3 : 2)
  const minutesInSleepPeriod = round(minutesAsleep / (efficiency / 100))
  const deep = round(minutesAsleep * (recent ? 0.11 : 0.17))
  const rem = round(minutesAsleep * (recent ? 0.18 : 0.22))
  return {
    bedMinute: round((recent ? 24 * 60 + 20 : 23 * 60 + 10) + noise('bedtime', daysAgo) * 20),
    minutesInSleepPeriod,
    minutesAsleep,
    deep,
    rem,
    light: minutesAsleep - deep - rem,
    awake: minutesInSleepPeriod - minutesAsleep
  }
}

// ---------------------------------------------------------------------------
// Nutrition

const BREAKFASTS = ['Greek yoghurt with berries', 'Scrambled eggs on toast', 'Overnight oats', 'Peanut butter toast']
const LUNCHES = ['Turkey sandwich', 'Lentil soup with bread', 'Tuna salad', 'Chicken wrap', 'Falafel bowl']
const DINNERS = ['Spaghetti bolognese', 'Chicken stir fry', 'Salmon with rice', 'Vegetable curry', 'Beef tacos']
const SNACKS = ['Crisps and chocolate', 'Ice cream', 'Biscuits and hot chocolate', 'Cheese and crackers']

interface Meal {
  mealType: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'
  minute: number
  foodName: string
  calories: number
}

function mealsOn(daysAgo: number): Meal[] {
  if (!inHistory(daysAgo)) return []
  const late = daysAgo <= LATE_PHASE_DAYS
  const pick = (list: string[], salt: number): string => list[(daysAgo + salt) % list.length]
  const run = runOn(daysAgo)
  const meals: Meal[] = [{
    mealType: 'BREAKFAST',
    minute: run ? 8 * 60 + 30 : 7 * 60 + 45,
    foodName: daysAgo === 1 ? 'Porridge with banana' : pick(BREAKFASTS, 0),
    calories: round(420 + noise('breakfast', daysAgo) * 60)
  }]
  if (daysAgo === 0) return meals
  meals.push({
    mealType: 'LUNCH',
    minute: 12 * 60 + 45,
    foodName: daysAgo === 1 ? 'Chicken burrito' : pick(LUNCHES, 1),
    calories: daysAgo === 1 ? 820 : round(640 + noise('lunch', daysAgo) * 80)
  })
  meals.push({
    mealType: 'SNACK',
    minute: 15 * 60 + 30,
    foodName: 'Banana and nuts',
    calories: 280
  })
  meals.push({
    mealType: 'DINNER',
    minute: 19 * 60 + 15,
    foodName: pick(DINNERS, 2),
    calories: round(900 + noise('dinner', daysAgo) * 90)
  })
  // The extra evening snack is what drives the weight gain.
  if (late) {
    meals.push({
      mealType: 'SNACK',
      minute: 21 * 60 + 30,
      foodName: pick(SNACKS, 3),
      calories: round(420 + noise('snack', daysAgo) * 60)
    })
  }
  return meals
}

export function nutritionEntries(daysAgo: number, now = evalNow()): NutritionLogEntry[] {
  return mealsOn(daysAgo).map((meal, index) => {
    const start = localInstant(daysAgo, meal.minute, now)
    return {
      id: `meal-${daysAgo}-${index}`,
      startTime: start,
      endTime: start,
      foodName: meal.foodName,
      mealType: meal.mealType,
      servingLabel: '1 serving',
      calories: meal.calories,
      proteinG: round(meal.calories * 0.05, 1),
      carbsG: round(meal.calories * 0.11, 1),
      fatG: round(meal.calories * 0.04, 1),
      fiberG: round(meal.calories * 0.01, 1),
      saturatedFatG: round(meal.calories * 0.015, 1),
      sodiumG: round(meal.calories * 0.0012, 2),
      sugarG: round(meal.calories * 0.03, 1)
    }
  })
}

export function caloriesIn(daysAgo: number): number | null {
  const meals = mealsOn(daysAgo)
  return meals.length ? meals.reduce((sum, meal) => sum + meal.calories, 0) : null
}

// ---------------------------------------------------------------------------
// Daily values

export function dayValues(daysAgo: number, now = evalNow()): DayValues {
  const worn = trackerWorn(daysAgo)
  const stepCount = steps(daysAgo)
  const run = runOn(daysAgo)
  const sleep = night(daysAgo)
  const weight = weightKg(daysAgo)
  const entries = nutritionEntries(daysAgo, now)
  const total = (key: keyof NutritionLogEntry): number | null =>
    entries.length ? round(entries.reduce((sum, entry) => sum + Number(entry[key] ?? 0), 0), 1) : null
  const partialDay = daysAgo === 0 ? 0.4 : 1
  return {
    steps: stepCount,
    distanceKm: stepCount == null ? null : round(stepCount * 0.00075 + (run ? run.distanceKm - run.steps * 0.00075 : 0), 2),
    floors: worn ? round((9 + noise('floors', daysAgo) * 3) * partialDay) : null,
    caloriesOut: stepCount == null ? null : round((1650 * partialDay) + stepCount * 0.045 + (run?.calories ?? 0)),
    activeMinutes: worn ? round((30 + noise('active', daysAgo) * 10) * partialDay + (run?.durationMin ?? 0)) : null,
    activeZoneMinutes: worn ? round((12 + noise('azm', daysAgo) * 6) * partialDay + (run ? 38 : 0)) : null,
    sedentaryMinutes: worn ? round((610 + noise('sedentary', daysAgo) * 60) * partialDay) : null,
    restingHeartRate: restingHeartRate(daysAgo),
    hrvMs: hrvMs(daysAgo),
    spo2Pct: worn ? round(96.5 + noise('spo2', daysAgo) * 0.6, 1) : null,
    breathingRate: worn ? round(14.2 + noise('breathing', daysAgo) * 0.5, 1) : null,
    skinTempDeltaC: worn ? round(noise('skin', daysAgo) * 0.3, 1) : null,
    sleepMinutes: sleep?.minutesAsleep ?? null,
    sleepEfficiency: sleep ? round((sleep.minutesAsleep / sleep.minutesInSleepPeriod) * 100) : null,
    weightKg: weight,
    bodyFatPct: bodyFatPct(daysAgo),
    bmi: weight == null ? null : round(weight / (HEIGHT_CM / 100) ** 2, 1),
    waterMl: inHistory(daysAgo) ? round((1800 + noise('water', daysAgo) * 300) * partialDay) : null,
    caloriesIn: caloriesIn(daysAgo),
    proteinG: total('proteinG'),
    carbsG: total('carbsG'),
    fatG: total('fatG'),
    fiberG: total('fiberG'),
    saturatedFatG: total('saturatedFatG'),
    sodiumG: total('sodiumG'),
    sugarG: total('sugarG')
  }
}

export function metricValue(metric: MetricKey, daysAgo: number): number | null {
  return dayValues(daysAgo)[metric] ?? null
}

/** Mean of a metric over days [fromDaysAgo, toDaysAgo] (inclusive), ignoring missing days. */
export function average(metric: MetricKey, fromDaysAgo: number, toDaysAgo: number): number | null {
  const values: number[] = []
  for (let d = toDaysAgo; d <= fromDaysAgo; d++) {
    const value = metricValue(metric, d)
    if (value != null) values.push(value)
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function runsBetween(fromDaysAgo: number, toDaysAgo: number): number {
  let count = 0
  for (let d = toDaysAgo; d <= fromDaysAgo; d++) if (isRunDay(d)) count++
  return count
}

// ---------------------------------------------------------------------------
// Detailed records

function sleepNight(daysAgo: number, now: Date): SleepNight | null {
  const summary = night(daysAgo)
  if (!summary) return null
  const date = dateAgo(daysAgo, now)
  const startMinute = summary.bedMinute
  // The evening before the night's end date.
  const startTime = localInstant(daysAgo + 1, startMinute, now)
  const endTime = localInstant(daysAgo + 1, startMinute + summary.minutesInSleepPeriod, now)
  const stages: SleepStageSegment[] = []
  const cycles = 5
  let cursor = Date.parse(startTime)
  const push = (type: SleepStageSegment['type'], minutes: number): void => {
    if (minutes <= 0) return
    const next = cursor + minutes * 60_000
    stages.push({ type, startTime: new Date(cursor).toISOString(), endTime: new Date(next).toISOString() })
    cursor = next
  }
  for (let cycle = 0; cycle < cycles; cycle++) {
    push('LIGHT', round(summary.light / cycles))
    push('DEEP', round(summary.deep / cycles))
    push('REM', round(summary.rem / cycles))
    push('AWAKE', round(summary.awake / cycles))
  }
  return {
    id: `sleep-${daysAgo}`,
    date,
    startTime,
    endTime,
    // A bedtime after midnight falls on the night's end date, not the evening before.
    startCivilDate: dateAgo(daysAgo + 1 - Math.floor(startMinute / 1440), now),
    startCivilMinute: startMinute % 1440,
    endCivilMinute: (startMinute + summary.minutesInSleepPeriod) % 1440,
    minutesAsleep: summary.minutesAsleep,
    minutesInSleepPeriod: summary.minutesInSleepPeriod,
    efficiency: round((summary.minutesAsleep / summary.minutesInSleepPeriod) * 100),
    isMainSleep: true,
    stages,
    stageMinutes: { DEEP: summary.deep, REM: summary.rem, LIGHT: summary.light, AWAKE: summary.awake },
    stageCounts: { DEEP: cycles, REM: cycles, LIGHT: cycles, AWAKE: cycles },
    minutesAwake: summary.awake,
    minutesToFirstDeepOrRem: round(summary.light / cycles),
    deepRemMinutes: summary.deep + summary.rem,
    interruptionMinutes: summary.awake,
    interruptionCount: daysAgo < RECENT_DAYS ? 9 : 4,
    minutesToFallAsleep: daysAgo < RECENT_DAYS ? 24 : 11,
    minutesAfterWakeUp: 4,
    outOfBedSegments: [],
    sleepType: 'STAGES',
    processed: true,
    manuallyEdited: false,
    stagesStatus: 'SUCCEEDED',
    respiratory: null
  }
}

function sleepDay(daysAgo: number, now: Date): SleepDay | null {
  const session = sleepNight(daysAgo, now)
  if (!session) return null
  return {
    date: session.date,
    sessions: [session],
    mainSessionId: session.id!,
    minutesAsleep: session.minutesAsleep,
    minutesInSleepPeriod: session.minutesInSleepPeriod,
    efficiency: session.efficiency,
    complete: true
  }
}

function workout(daysAgo: number, now: Date): Workout | null {
  const run = runOn(daysAgo)
  if (!run) return null
  return {
    id: `run-${daysAgo}`,
    name: 'Run',
    startTime: localInstant(daysAgo, run.startMinute, now),
    startMinute: run.startMinute,
    durationMin: run.durationMin,
    elapsedDurationMin: run.durationMin + 2,
    exerciseType: 'RUNNING',
    calories: run.calories,
    distanceKm: run.distanceKm,
    avgHeartRate: run.avgHeartRate,
    steps: run.steps,
    activeZoneMinutes: 38,
    averageSpeedKph: round(run.distanceKm / (run.durationMin / 60), 1),
    averagePaceSecPerKm: round((run.durationMin * 60) / run.distanceKm),
    elevationGainM: round(40 + noise('elevation', daysAgo) * 15),
    heartRateZones: { lightMin: 4, moderateMin: 8, vigorousMin: run.durationMin - 14, peakMin: 2 },
    hasGps: true,
    recordingSource: 'Fitbit Air',
    deviceName: 'Fitbit Air'
  }
}

function hourlySteps(daysAgo: number, now: Date): HourlySteps[] {
  const total = steps(daysAgo)
  if (total == null) return []
  const lastHour = daysAgo === 0 ? now.getHours() : 23
  const weights = Array.from({ length: 24 }, (_, hour) =>
    hour < 7 || hour > 22 ? 0 : 1 + (hour === 7 && isRunDay(daysAgo) ? 12 : 0) + Math.abs(noise('hourly', daysAgo * 24 + hour))
  ).map((weight, hour) => (hour <= lastHour ? weight : 0))
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  return weights.map((weight, hour) => ({ hour, steps: round((weight / sum) * total) }))
}

function heartRate(daysAgo: number, now: Date): HeartRatePoint[] {
  const rhr = restingHeartRate(daysAgo)
  if (rhr == null) return []
  const lastMinute = daysAgo === 0 ? now.getHours() * 60 + now.getMinutes() : 1439
  const run = runOn(daysAgo)
  const points: HeartRatePoint[] = []
  for (let minute = 0; minute <= lastMinute; minute += 5) {
    const awake = minute >= 7 * 60 && minute < 23 * 60
    const running = run != null && minute >= run.startMinute && minute < run.startMinute + run.durationMin
    const bpm = running ? run.avgHeartRate : (awake ? rhr + 18 : rhr) + noise('hr', daysAgo * 1440 + minute) * 5
    points.push({ minute, bpm: round(bpm) })
  }
  return points
}

// ---------------------------------------------------------------------------
// The health-service surface the assistant tools read

export interface HealthCall {
  fn: string
  start?: string
  end?: string
  date?: string
  metrics?: MetricKey[]
}

export type HealthCallListener = (call: HealthCall) => void

export function createHealthFixture(record: HealthCallListener, now = evalNow) {
  const clampRange = (start: string, end: string): [string, string] => (start <= end ? [start, end] : [end, start])

  return {
    async getSeries(metrics: MetricKey[], start: string, end: string): Promise<SeriesResult> {
      const [s, e] = clampRange(start, end)
      record({ fn: 'getSeries', metrics: [...metrics], start: s, end: e })
      const at = now()
      const days: SeriesResult['days'] = {}
      for (const date of datesBetween(s, e)) {
        const daysAgo = daysAgoOf(date, at)
        const values = inHistory(daysAgo) ? dayValues(daysAgo, at) : {}
        days[date] = Object.fromEntries(metrics.map((metric) => [metric, values[metric] ?? null]))
      }
      return { source: 'live', start: s, end: e, days }
    },

    async getSleepRange(start: string, end: string): Promise<SleepRangeResult> {
      const [s, e] = clampRange(start, end)
      record({ fn: 'getSleepRange', start: s, end: e })
      const at = now()
      const days = datesBetween(s, e)
        .map((date) => sleepDay(daysAgoOf(date, at), at))
        .filter((day): day is SleepDay => day != null)
      return { source: 'live', days }
    },

    async getWorkoutsRange(start: string, end: string): Promise<WorkoutsResult> {
      const [s, e] = clampRange(start, end)
      record({ fn: 'getWorkoutsRange', start: s, end: e })
      const at = now()
      const workouts = datesBetween(s, e)
        .map((date) => workout(daysAgoOf(date, at), at))
        .filter((item): item is Workout => item != null)
      return { source: 'live', workouts }
    },

    async getIntraday(date: string, _force?: boolean, _signal?: AbortSignal, scope: 'steps' | 'heart' | 'both' = 'both'): Promise<IntradaySnapshot> {
      record({ fn: `getIntraday:${scope}`, date })
      const at = now()
      const daysAgo = daysAgoOf(date, at)
      const heart = scope === 'steps' ? [] : heartRate(daysAgo, at)
      return {
        date,
        source: 'live',
        stepsHourly: scope === 'heart' ? [] : hourlySteps(daysAgo, at),
        heartRate: heart,
        currentHeartRate: daysAgo === 0 ? heart.at(-1)?.bpm ?? null : null
      }
    },

    async getNutritionLogs(date: string): Promise<NutritionLogsResult> {
      record({ fn: 'getNutritionLogs', date })
      const at = now()
      return { date, source: 'live', entries: nutritionEntries(daysAgoOf(date, at), at) }
    },

    async getBodyMeasurements(start: string, end: string): Promise<BodyMeasurementsResult> {
      const [s, e] = clampRange(start, end)
      record({ fn: 'getBodyMeasurements', start: s, end: e })
      const at = now()
      const measurements: BodyMeasurement[] = datesBetween(s, e).flatMap((date) => {
        const daysAgo = daysAgoOf(date, at)
        const weight = weightKg(daysAgo)
        return weight == null
          ? []
          : [{ id: `weight-${daysAgo}`, time: localInstant(daysAgo, 7 * 60 + 10, at), weightKg: weight, bodyFatPct: bodyFatPct(daysAgo), notes: null }]
      })
      return { source: 'live', measurements, heightCm: HEIGHT_CM }
    },

    async getDevices(): Promise<PairedDevice[]> {
      record({ fn: 'getDevices' })
      return [{
        name: 'Fitbit Air',
        model: 'Air',
        type: 'TRACKER',
        batteryPct: BATTERY_PCT,
        batteryState: 'MEDIUM',
        lastSync: new Date(now().getTime() - 10 * 60_000).toISOString(),
        features: ['heart-rate', 'sleep', 'spo2']
      }]
    }
  }
}

/** What the app's background sync would have cached: the last 180 days. */
export function cachedCoverage(now = evalNow()): Record<string, { days: number; first: string; last: string }> {
  const coverage: Record<string, { days: number; first: string; last: string }> = {}
  for (let d = 179; d >= 0; d--) {
    const values = dayValues(d, now)
    for (const [metric, value] of Object.entries(values)) {
      if (value == null) continue
      const date = dateAgo(d, now)
      const entry = coverage[metric]
      if (!entry) coverage[metric] = { days: 1, first: date, last: date }
      else {
        entry.days++
        entry.last = date
      }
    }
  }
  return coverage
}

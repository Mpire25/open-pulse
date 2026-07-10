import type {
  SleepNight,
  SleepRespiratoryStageStats,
  SleepRespiratorySummary,
  SleepStageSegment,
  SleepStageType
} from '../shared/types'
import { dateFromCivil, type CivilDateTime, type RawDataPoint } from './health-api'

const STAGE_MAP: Record<string, SleepStageType> = {
  AWAKE: 'AWAKE',
  RESTLESS: 'AWAKE',
  LIGHT: 'LIGHT',
  ASLEEP: 'LIGHT',
  DEEP: 'DEEP',
  REM: 'REM'
}

interface RawSleep {
  interval?: { startTime?: string; endTime?: string; civilEndTime?: CivilDateTime }
  stages?: Array<{ type?: string; startTime?: string; endTime?: string }>
  outOfBedSegments?: Array<{ startTime?: string; endTime?: string }>
  type?: string
  metadata?: {
    nap?: boolean
    main?: boolean
    processed?: boolean
    manuallyEdited?: boolean
    stagesStatus?: string
  }
  summary?: {
    minutesAsleep?: string
    minutesInSleepPeriod?: string
    minutesAwake?: string
    minutesToFallAsleep?: string
    minutesAfterWakeUp?: string
    stagesSummary?: Array<{ type?: string; minutes?: string; count?: string }>
  }
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function localIsoDate(date: Date): string {
  const timezoneOffset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function deriveStageDetails(stages: SleepStageSegment[]): {
  minutesToFirstDeepOrRem: number | null
  deepRemMinutes: number
  interruptionMinutes: number
  interruptionCount: number
} {
  const asleepStages = stages.filter((stage) => stage.type !== 'AWAKE')
  const firstAsleepAt = Math.min(...asleepStages.map((stage) => Date.parse(stage.startTime)))
  const lastAsleepAt = Math.max(...asleepStages.map((stage) => Date.parse(stage.endTime)))
  const firstDeepOrRemAt = Math.min(
    ...stages
      .filter((stage) => stage.type === 'DEEP' || stage.type === 'REM')
      .map((stage) => Date.parse(stage.startTime))
  )
  const sessionStartAt = Math.min(...stages.map((stage) => Date.parse(stage.startTime)))
  const interruptionRanges = stages
    .filter((stage) => {
      const start = Date.parse(stage.startTime)
      const end = Date.parse(stage.endTime)
      return stage.type === 'AWAKE' && start >= firstAsleepAt && end <= lastAsleepAt
    })
    .map((stage) => ({ start: Date.parse(stage.startTime), end: Date.parse(stage.endTime) }))
    .sort((a, b) => a.start - b.start)

  const mergedInterruptions: Array<{ start: number; end: number }> = []
  for (const range of interruptionRanges) {
    const previous = mergedInterruptions.at(-1)
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end)
    else mergedInterruptions.push({ ...range })
  }

  return {
    minutesToFirstDeepOrRem:
      Number.isFinite(firstDeepOrRemAt) && Number.isFinite(sessionStartAt)
        ? Math.max(0, Math.round((firstDeepOrRemAt - sessionStartAt) / 60_000))
        : null,
    deepRemMinutes: Math.round(
      stages
        .filter((stage) => stage.type === 'DEEP' || stage.type === 'REM')
        .reduce((total, stage) => total + (Date.parse(stage.endTime) - Date.parse(stage.startTime)) / 60_000, 0)
    ),
    interruptionMinutes: Math.round(
      mergedInterruptions.reduce((total, range) => total + (range.end - range.start) / 60_000, 0)
    ),
    interruptionCount: mergedInterruptions.length
  }
}

export function mapSleep(point: RawDataPoint): SleepNight | null {
  const sleep = point.sleep as RawSleep | undefined
  if (!sleep?.interval?.startTime || !sleep.interval.endTime) return null
  const stages: SleepStageSegment[] = (sleep.stages ?? [])
    .filter((stage) => stage.startTime && stage.endTime && STAGE_MAP[stage.type?.toUpperCase() ?? ''])
    .map((stage) => ({
      type: STAGE_MAP[stage.type!.toUpperCase()],
      startTime: stage.startTime!,
      endTime: stage.endTime!
    }))
  const stageMinutes: Partial<Record<SleepStageType, number>> = {}
  const derivedStageCounts: Partial<Record<SleepStageType, number>> = {}
  for (const stage of stages) {
    const minutes = (Date.parse(stage.endTime) - Date.parse(stage.startTime)) / 60_000
    stageMinutes[stage.type] = Math.round((stageMinutes[stage.type] ?? 0) + minutes)
    derivedStageCounts[stage.type] = (derivedStageCounts[stage.type] ?? 0) + 1
  }
  const summaryStageCounts: Partial<Record<SleepStageType, number>> = {}
  for (const stage of sleep.summary?.stagesSummary ?? []) {
    const mapped = STAGE_MAP[stage.type?.toUpperCase() ?? '']
    if (!mapped) continue
    summaryStageCounts[mapped] = (summaryStageCounts[mapped] ?? 0) + (numberValue(stage.count) ?? 0)
  }
  const stageCounts = Object.keys(summaryStageCounts).length > 0 ? summaryStageCounts : derivedStageCounts
  const stageDetails = deriveStageDetails(stages)
  const minutesAsleep = numberValue(sleep.summary?.minutesAsleep) ?? 0
  const period = numberValue(sleep.summary?.minutesInSleepPeriod) ?? 0
  const date = dateFromCivil(sleep.interval.civilEndTime) ?? localIsoDate(new Date(sleep.interval.endTime))
  return {
    date,
    startTime: sleep.interval.startTime,
    endTime: sleep.interval.endTime,
    minutesAsleep,
    minutesInSleepPeriod: period,
    efficiency: period > 0 ? Math.round((minutesAsleep / period) * 100) : null,
    isMainSleep: sleep.metadata?.main ?? sleep.metadata?.nap !== true,
    stages,
    stageMinutes,
    stageCounts,
    minutesAwake: numberValue(sleep.summary?.minutesAwake),
    ...stageDetails,
    minutesToFallAsleep: numberValue(sleep.summary?.minutesToFallAsleep),
    minutesAfterWakeUp: numberValue(sleep.summary?.minutesAfterWakeUp),
    outOfBedSegments: (sleep.outOfBedSegments ?? []).flatMap((segment) =>
      segment.startTime && segment.endTime ? [{ startTime: segment.startTime, endTime: segment.endTime }] : []
    ),
    sleepType: sleep.type ?? null,
    processed: typeof sleep.metadata?.processed === 'boolean' ? sleep.metadata.processed : null,
    manuallyEdited: typeof sleep.metadata?.manuallyEdited === 'boolean' ? sleep.metadata.manuallyEdited : null,
    stagesStatus: sleep.metadata?.stagesStatus ?? null,
    respiratory: null
  }
}

export interface MappedRespiratorySummary {
  timestamp: number
  summary: SleepRespiratorySummary
}

function mapRespiratoryStats(value: unknown): SleepRespiratoryStageStats | null {
  const record = value as Record<string, unknown> | undefined
  const breathsPerMinute = numberValue(record?.breathsPerMinute)
  if (breathsPerMinute == null) return null
  return {
    breathsPerMinute,
    standardDeviation: numberValue(record?.standardDeviation),
    signalToNoise: numberValue(record?.signalToNoise)
  }
}

export function mapSleepRespiratory(point: RawDataPoint): MappedRespiratorySummary | null {
  const record = point.respiratoryRateSleepSummary as Record<string, unknown> | undefined
  const sampleTime = record?.sampleTime as
    | { physicalTime?: string; civilTime?: CivilDateTime }
    | undefined
  const physicalTimestamp = sampleTime?.physicalTime ? Date.parse(sampleTime.physicalTime) : Number.NaN
  const civilDate = sampleTime?.civilTime?.date
  const civilTime = sampleTime?.civilTime?.time
  const civilTimestamp =
    civilDate?.year && civilDate.month && civilDate.day
      ? new Date(
          civilDate.year,
          civilDate.month - 1,
          civilDate.day,
          civilTime?.hours ?? 0,
          civilTime?.minutes ?? 0,
          civilTime?.seconds ?? 0
        ).getTime()
      : Number.NaN
  const timestamp = Number.isFinite(physicalTimestamp) ? physicalTimestamp : civilTimestamp
  if (!record || !Number.isFinite(timestamp)) return null
  return {
    timestamp,
    summary: {
      full: mapRespiratoryStats(record.fullSleepStats),
      light: mapRespiratoryStats(record.lightSleepStats),
      deep: mapRespiratoryStats(record.deepSleepStats),
      rem: mapRespiratoryStats(record.remSleepStats)
    }
  }
}

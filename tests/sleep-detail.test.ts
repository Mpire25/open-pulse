import { describe, expect, test } from 'bun:test'
import { mapSleep, mapSleepRespiratory } from '../src/main/sleep-detail'

describe('sleep detail normalization', () => {
  test('retains latency, awake time, stage counts, metadata, and out-of-bed periods', () => {
    const night = mapSleep({
      sleep: {
        interval: {
          startTime: '2026-07-09T22:30:00Z',
          endTime: '2026-07-10T06:30:00Z',
          civilStartTime: { date: { year: 2026, month: 7, day: 9 }, time: { hours: 23, minutes: 30 } },
          civilEndTime: { date: { year: 2026, month: 7, day: 10 }, time: { hours: 7, minutes: 30 } }
        },
        type: 'STAGES',
        stages: [
          { type: 'LIGHT', startTime: '2026-07-09T22:30:00Z', endTime: '2026-07-09T23:00:00Z' },
          { type: 'DEEP', startTime: '2026-07-09T23:00:00Z', endTime: '2026-07-09T23:30:00Z' },
          { type: 'AWAKE', startTime: '2026-07-09T23:30:00Z', endTime: '2026-07-09T23:36:00Z' },
          { type: 'REM', startTime: '2026-07-09T23:36:00Z', endTime: '2026-07-10T00:06:00Z' }
        ],
        outOfBedSegments: [{ startTime: '2026-07-10T03:00:00Z', endTime: '2026-07-10T03:05:00Z' }],
        metadata: { main: true, processed: true, manuallyEdited: true, stagesStatus: 'SUCCEEDED' },
        summary: {
          minutesAsleep: '440',
          minutesInSleepPeriod: '480',
          minutesAwake: '40',
          minutesToFallAsleep: '12',
          minutesAfterWakeUp: '4',
          stagesSummary: [
            { type: 'LIGHT', minutes: '220', count: '8' },
            { type: 'DEEP', minutes: '90', count: '4' }
          ]
        }
      }
    })
    expect(night).not.toBeNull()
    expect(night?.startCivilDate).toBe('2026-07-09')
    expect(night?.startCivilMinute).toBe(23 * 60 + 30)
    expect(night?.endCivilMinute).toBe(7 * 60 + 30)
    expect(night?.minutesToFallAsleep).toBe(12)
    expect(night?.minutesAwake).toBe(40)
    expect(night?.minutesToFirstDeepOrRem).toBe(30)
    expect(night?.deepRemMinutes).toBe(60)
    expect(night?.interruptionMinutes).toBe(6)
    expect(night?.interruptionCount).toBe(1)
    expect(night?.minutesAfterWakeUp).toBe(4)
    expect(night?.stageCounts).toEqual({ LIGHT: 8, DEEP: 4 })
    expect(night?.outOfBedSegments).toEqual([
      { startTime: '2026-07-10T03:00:00Z', endTime: '2026-07-10T03:05:00Z' }
    ])
    expect(night?.manuallyEdited).toBe(true)
    expect(night?.stagesStatus).toBe('SUCCEEDED')
  })

  test('retains respiratory statistics for the full night and each stage', () => {
    const result = mapSleepRespiratory({
      respiratoryRateSleepSummary: {
        sampleTime: { physicalTime: '2026-07-10T06:30:00Z' },
        fullSleepStats: { breathsPerMinute: 14.2, standardDeviation: 1.1, signalToNoise: 7.4 },
        lightSleepStats: { breathsPerMinute: 14.8, standardDeviation: 1.2, signalToNoise: 6.9 },
        deepSleepStats: { breathsPerMinute: 12.9, standardDeviation: 0.8, signalToNoise: 7.8 },
        remSleepStats: { breathsPerMinute: 15.1, standardDeviation: 1.4, signalToNoise: 6.4 }
      }
    })
    expect(result?.summary.full).toEqual({ breathsPerMinute: 14.2, standardDeviation: 1.1, signalToNoise: 7.4 })
    expect(result?.summary.deep?.breathsPerMinute).toBe(12.9)
    expect(result?.summary.rem?.signalToNoise).toBe(6.4)
  })
})

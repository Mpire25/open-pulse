import { describe, expect, test } from 'bun:test'
import { interpretSleepNight } from '../src/renderer/src/lib/sleep-insights'
import type { SleepNight } from '../src/shared/types'

function night(date: string, overrides: Partial<SleepNight> = {}): SleepNight {
  return {
    date,
    startTime: `${date}T00:00:00Z`,
    endTime: `${date}T08:00:00Z`,
    minutesAsleep: 450,
    minutesInSleepPeriod: 480,
    efficiency: 94,
    isMainSleep: true,
    stages: [{ type: 'LIGHT', startTime: `${date}T00:00:00Z`, endTime: `${date}T08:00:00Z` }],
    stageMinutes: { LIGHT: 480 },
    stageCounts: { LIGHT: 1 },
    minutesAwake: 20,
    minutesToFirstDeepOrRem: 22,
    deepRemMinutes: 150,
    interruptionMinutes: 8,
    interruptionCount: 2,
    minutesToFallAsleep: null,
    minutesAfterWakeUp: null,
    outOfBedSegments: [],
    sleepType: 'STAGES',
    processed: true,
    manuallyEdited: false,
    stagesStatus: 'SUCCEEDED',
    respiratory: {
      full: { breathsPerMinute: 14.5, standardDeviation: null, signalToNoise: null },
      light: null,
      deep: null,
      rem: null
    },
    ...overrides
  }
}

describe('sleep interpretation', () => {
  const history = Array.from({ length: 7 }, (_, index) =>
    night(`2026-07-0${index + 1}`, {
      minutesAsleep: 450 + index,
      efficiency: 93 + (index % 2),
      minutesAwake: 20 + (index % 3),
      interruptionCount: 2,
      deepRemMinutes: 145 + index,
      minutesToFirstDeepOrRem: 20 + (index % 3)
    })
  )

  test('describes a near-goal, continuous night positively', () => {
    const result = interpretSleepNight(
      night('2026-07-08', { minutesAsleep: 464, efficiency: 97, minutesAwake: 13, interruptionCount: 1 }),
      history,
      480
    )

    expect(result.headline).toBe('Strong night')
    expect(result.duration.label).toBe('Near your goal')
    expect(result.efficiency?.label).toBe('Above your usual')
    expect(result.awake?.label).toBe('Less awake')
  })

  test('flags a short or unusually disrupted night without a medical score', () => {
    const short = interpretSleepNight(night('2026-07-08', { minutesAsleep: 350 }), history, 480)
    const disrupted = interpretSleepNight(
      night('2026-07-08', { minutesAsleep: 460, efficiency: 80, interruptionCount: 6 }),
      history,
      480
    )

    expect(short.headline).toBe('Short night')
    expect(short.duration.tone).toBe('caution')
    expect(disrupted.headline).toBe('More disrupted than usual')
    expect(disrupted.interruptions?.label).toBe('More than usual')
  })

  test('waits for enough prior nights before making personal comparisons', () => {
    const result = interpretSleepNight(night('2026-07-03'), history.slice(0, 2), 480)

    expect(result.efficiency).toBeNull()
  })
})

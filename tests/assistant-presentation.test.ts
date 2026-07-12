import { describe, expect, test } from 'bun:test'
import {
  resolveAutomaticPresentation,
  resolvePresentation,
  type AgentDataset
} from '../src/main/assistant-presentation'

function dailyDatasets(): Map<string, AgentDataset> {
  return new Map([
    [
      'daily-1',
      {
        tool: 'query_daily_metrics',
        data: {
          source: 'live',
          requestedRange: { start: '2026-07-01', end: '2026-07-04' },
          days: {
            '2026-07-01': { steps: 4_000, sleepMinutes: 420 },
            '2026-07-02': { steps: 5_000, sleepMinutes: 450 },
            '2026-07-03': { steps: 6_000, sleepMinutes: null },
            '2026-07-04': { steps: 7_000, sleepMinutes: 480 }
          }
        }
      }
    ]
  ])
}

describe('assistant visual presentation', () => {
  test('resolves trusted metric cards, comparisons, and charts from one dataset', () => {
    const parts = resolvePresentation(
      {
        metricCards: [{ datasetId: 'daily-1', metric: 'steps', date: '2026-07-04' }],
        comparisons: [
          {
            datasetId: 'daily-1',
            metric: 'steps',
            title: 'Steps comparison',
            currentLabel: 'Latest two days',
            currentStartDate: '2026-07-03',
            currentEndDate: '2026-07-04',
            previousLabel: 'Previous two days',
            previousStartDate: '2026-07-01',
            previousEndDate: '2026-07-02'
          }
        ],
        charts: [{ datasetId: 'daily-1', metric: 'sleepMinutes', title: 'Sleep trend' }],
        workouts: []
      },
      dailyDatasets()
    )

    expect(parts).toHaveLength(3)
    expect(parts[0]).toMatchObject({ type: 'metric-card', metric: 'steps', value: 7_000 })
    expect(parts[1]).toMatchObject({
      type: 'comparison',
      current: { value: 13_000, observations: 2 },
      previous: { value: 9_000, observations: 2 },
      absoluteChange: 4_000
    })
    expect(parts[2]).toMatchObject({ type: 'trend-chart', observations: 3 })
  })

  test('does not allow a visual to escape its source dataset', () => {
    expect(() =>
      resolvePresentation(
        {
          metricCards: [{ datasetId: 'daily-1', metric: 'steps', date: '2026-07-05' }],
          comparisons: [],
          charts: [],
          workouts: []
        },
        dailyDatasets()
      )
    ).toThrow('outside its dataset range')
  })

  test('only opens workouts that were actually returned by the tool', () => {
    const datasets = new Map<string, AgentDataset>([
      [
        'workouts-1',
        {
          tool: 'query_workouts',
          data: {
            source: 'live',
            workouts: [
              {
                id: 'known-workout',
                name: 'Morning run',
                startTime: '2026-07-04T07:00:00Z',
                durationMin: 35,
                calories: 320,
                distanceKm: 5.2,
                avgHeartRate: 148,
                steps: 5_800,
                activeZoneMinutes: 31
              }
            ]
          }
        }
      ]
    ])

    expect(() =>
      resolvePresentation(
        { metricCards: [], comparisons: [], charts: [], workouts: [{ datasetId: 'workouts-1', workoutId: 'invented' }] },
        datasets
      )
    ).toThrow('is not in dataset')
  })

  test('draws a trend directly from an analysis dataset', () => {
    const datasets = new Map<string, AgentDataset>([
      [
        'analysis-1',
        {
          tool: 'analyze_daily_metrics',
          data: {
            source: 'live',
            requestedRange: { start: '2026-07-01', end: '2026-07-04' },
            units: { restingHeartRate: 'bpm' },
            days: {
              '2026-07-01': { restingHeartRate: 61 },
              '2026-07-02': { restingHeartRate: 62 },
              '2026-07-03': { restingHeartRate: 64 },
              '2026-07-04': { restingHeartRate: 65 }
            }
          }
        }
      ]
    ])

    expect(
      resolvePresentation(
        {
          metricCards: [],
          comparisons: [],
          charts: [{ datasetId: 'analysis-1', metric: 'restingHeartRate', title: 'Resting heart rate trend' }],
          workouts: []
        },
        datasets
      )[0]
    ).toMatchObject({ type: 'trend-chart', metric: 'restingHeartRate', observations: 4 })
  })

  test('builds a restrained sleep comparison fallback from sleep sessions', () => {
    const datasets = new Map<string, AgentDataset>([
      [
        'sleep-1',
        {
          tool: 'query_sleep',
          data: {
            source: 'live',
            requestedRange: { start: '2026-07-06', end: '2026-07-12' },
            nights: [
              { date: '2026-07-06', minutesAsleep: 420, efficiency: 95 },
              { date: '2026-07-07', minutesAsleep: 450, efficiency: 96 },
              { date: '2026-07-11', minutesAsleep: 498, efficiency: 97 }
            ]
          }
        }
      ]
    ])

    const parts = resolveAutomaticPresentation('How did I sleep this week compared to last night?', datasets)
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'comparison',
      metric: 'sleepMinutes',
      current: { label: 'Last night', startDate: '2026-07-11', endDate: '2026-07-11', value: 498 },
      previous: { label: 'Earlier period', startDate: '2026-07-06', endDate: '2026-07-10', value: 435 }
    })
  })

  test('adds a trend fallback but does not visualize an external guideline comparison', () => {
    const datasets = dailyDatasets()
    expect(resolveAutomaticPresentation('Is my sleep trending up or down?', datasets)).toHaveLength(1)
    expect(resolveAutomaticPresentation('How do my steps compare with NHS recommendations?', datasets)).toEqual([])
    expect(resolveAutomaticPresentation('What is my current health compared with NHS ideals?', datasets)).toEqual([])
  })
})

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
            '2026-07-01': { steps: 4_000, sleepMinutes: 420, activeZoneMinutes: 20, bmi: 23.4 },
            '2026-07-02': { steps: 5_000, sleepMinutes: 450, activeZoneMinutes: 30, bmi: null },
            '2026-07-03': { steps: 6_000, sleepMinutes: null, activeZoneMinutes: 40, bmi: 23.2 },
            '2026-07-04': {
              steps: 7_000,
              sleepMinutes: 480,
              activeZoneMinutes: null,
              bmi: null,
              caloriesIn: 2_050,
              proteinG: 142,
              carbsG: 220,
              fatG: 72,
              fiberG: 31,
              saturatedFatG: 18,
              sodiumG: 2.1,
              sugarG: 54
            }
          }
        }
      }
    ]
  ])
}

function sleepDatasets(): Map<string, AgentDataset> {
  return new Map([
    [
      'sleep-1',
      {
        tool: 'query_sleep',
        data: {
          source: 'live',
          requestedRange: { start: '2026-07-11', end: '2026-07-11' },
          nights: [
            {
              date: '2026-07-11',
              startTime: '2026-07-10T22:45:00Z',
              endTime: '2026-07-11T07:20:00Z',
              minutesAsleep: 498,
              minutesInSleepPeriod: 515,
              efficiency: 97,
              stageMinutes: { AWAKE: 17, REM: 80, LIGHT: 292, DEEP: 126 },
              stages: [
                { type: 'LIGHT', startTime: '2026-07-10T22:45:00Z', endTime: '2026-07-10T23:15:00Z' },
                { type: 'DEEP', startTime: '2026-07-10T23:15:00Z', endTime: '2026-07-11T00:00:00Z' }
              ]
            }
          ]
        }
      }
    ]
  ])
}

function nutritionDatasets(): Map<string, AgentDataset> {
  return new Map([
    [
      'nutrition-1',
      {
        tool: 'query_nutrition_logs',
        data: {
          source: 'live',
          date: '2026-07-11',
          entries: [
            {
              id: 'yogurt',
              startTime: '2026-07-11T08:00:00Z',
              endTime: '2026-07-11T08:05:00Z',
              foodName: 'Greek yogurt',
              mealType: 'BREAKFAST',
              servingLabel: '1 bowl',
              calories: 180,
              proteinG: 20,
              carbsG: 12,
              fatG: 5,
              fiberG: 1,
              saturatedFatG: 3,
              sodiumG: 0.1,
              sugarG: 8
            },
            {
              id: 'salad',
              startTime: '2026-07-11T12:30:00Z',
              endTime: '2026-07-11T12:40:00Z',
              foodName: 'Chicken salad',
              mealType: 'LUNCH',
              servingLabel: '1 plate',
              calories: 430,
              proteinG: 38,
              carbsG: 24,
              fatG: 19,
              fiberG: 7,
              saturatedFatG: 4,
              sodiumG: 0.8,
              sugarG: 6
            }
          ]
        }
      }
    ]
  ])
}

describe('assistant visual presentation', () => {
  test('resolves a trusted multi-metric overview with appropriate aggregations', () => {
    const parts = resolvePresentation(
      {
        overviews: [
          {
            datasetId: 'daily-1',
            title: 'Recent health overview',
            startDate: '2026-07-01',
            endDate: '2026-07-04',
            metrics: ['steps', 'activeZoneMinutes', 'sleepMinutes', 'bmi']
          }
        ],
        metricCards: [{ datasetId: 'daily-1', metric: 'steps', date: '2026-07-04' }],
        comparisons: [],
        charts: [],
        workouts: []
      },
      dailyDatasets()
    )

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'overview',
      title: 'Recent health overview',
      startDate: '2026-07-01',
      endDate: '2026-07-04',
      items: [
        { metric: 'steps', aggregation: 'average', value: 5_500, observations: 4 },
        { metric: 'activeZoneMinutes', aggregation: 'total', value: 90, observations: 3 },
        { metric: 'sleepMinutes', aggregation: 'average', value: 450, observations: 3 },
        {
          metric: 'bmi',
          aggregation: 'latest',
          value: 23.2,
          observations: 2,
          action: { type: 'open-metric', date: '2026-07-03' }
        }
      ]
    })
  })

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
      current: { value: 13_000, aggregation: 'total', observations: 2 },
      previous: { value: 9_000, aggregation: 'total', observations: 2 },
      comparable: true,
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

  test('resolves a sleep-stage card only from a returned night', () => {
    const parts = resolvePresentation(
      { sleepCards: [{ datasetId: 'sleep-1', date: '2026-07-11' }] },
      sleepDatasets()
    )

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      type: 'sleep-card',
      night: { date: '2026-07-11', minutesAsleep: 498, efficiency: 97 },
      action: { type: 'open-sleep-stages', date: '2026-07-11' }
    })
    expect(() =>
      resolvePresentation(
        { sleepCards: [{ datasetId: 'sleep-1', date: '2026-07-10' }] },
        sleepDatasets()
      )
    ).toThrow('outside its dataset range')
  })

  test('resolves trusted nutrition cards for a day, meal, and returned item', () => {
    const datasets = nutritionDatasets()
    const parts = resolvePresentation(
      {
        nutritionCards: [
          { datasetId: 'nutrition-1', date: '2026-07-11', scope: 'meal', mealGroup: 'Lunch', entryId: null },
          { datasetId: 'nutrition-1', date: '2026-07-11', scope: 'item', mealGroup: null, entryId: 'yogurt' }
        ]
      },
      datasets
    )

    expect(parts[0]).toMatchObject({
      type: 'nutrition-card',
      scope: 'meal',
      title: 'Lunch',
      itemCount: 1,
      values: { calories: 430, proteinG: 38, carbsG: 24, fatG: 19 },
      action: { type: 'open-nutrition', date: '2026-07-11' }
    })
    expect(parts[1]).toMatchObject({
      type: 'nutrition-card',
      scope: 'item',
      title: 'Greek yogurt',
      servingLabel: '1 bowl',
      values: { calories: 180, proteinG: 20 }
    })
    expect(() => resolvePresentation({
      nutritionCards: [
        { datasetId: 'nutrition-1', date: '2026-07-11', scope: 'item', mealGroup: null, entryId: 'invented' }
      ]
    }, datasets)).toThrow('is not in dataset')
  })

  test('resolves a daily nutrition card from narrow daily metrics', () => {
    expect(resolvePresentation({
      nutritionCards: [
        { datasetId: 'daily-1', date: '2026-07-04', scope: 'day', mealGroup: null, entryId: null }
      ]
    }, dailyDatasets())[0]).toMatchObject({
      type: 'nutrition-card',
      scope: 'day',
      title: 'Daily nutrition',
      values: { calories: 2_050, proteinG: 142, fiberG: 31 }
    })
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
      current: { label: 'Last night', startDate: '2026-07-11', endDate: '2026-07-11', value: 498, aggregation: 'value' },
      previous: { label: 'Earlier period', startDate: '2026-07-06', endDate: '2026-07-10', value: 435, aggregation: 'average' },
      comparable: true
    })
  })

  test('uses averages for unequal additive periods unless totals are explicit', () => {
    const datasets = new Map<string, AgentDataset>([
      [
        'protein-1',
        {
          tool: 'query_daily_metrics',
          data: {
            source: 'live',
            requestedRange: { start: '2026-07-04', end: '2026-07-11' },
            units: { proteinG: 'g' },
            days: {
              '2026-07-04': { proteinG: 90 },
              '2026-07-05': { proteinG: 100 },
              '2026-07-06': { proteinG: 110 },
              '2026-07-07': { proteinG: 120 },
              '2026-07-08': { proteinG: 130 },
              '2026-07-09': { proteinG: 140 },
              '2026-07-10': { proteinG: 150 },
              '2026-07-11': { proteinG: 135 }
            }
          }
        }
      ]
    ])
    const request = {
      datasetId: 'protein-1',
      metric: 'proteinG',
      title: 'Protein comparison',
      currentLabel: 'Yesterday',
      currentStartDate: '2026-07-11',
      currentEndDate: '2026-07-11',
      currentAggregation: 'auto',
      previousLabel: 'Previous week',
      previousStartDate: '2026-07-04',
      previousEndDate: '2026-07-10',
      previousAggregation: 'auto'
    }

    expect(resolvePresentation({ comparisons: [request] }, datasets)[0]).toMatchObject({
      current: { value: 135, aggregation: 'value' },
      previous: { value: 120, aggregation: 'average' },
      comparable: true,
      absoluteChange: 15,
      percentChange: 12.5
    })

    expect(resolvePresentation({
      comparisons: [{ ...request, currentAggregation: 'total', previousAggregation: 'total' }]
    }, datasets)[0]).toMatchObject({
      current: { value: 135, aggregation: 'total' },
      previous: { value: 840, aggregation: 'total' },
      comparable: false,
      absoluteChange: null,
      percentChange: null
    })

    expect(resolvePresentation({
      comparisons: [{ ...request, currentAggregation: 'total', previousAggregation: 'average' }]
    }, datasets)[0]).toMatchObject({
      current: { value: 135, aggregation: 'total' },
      previous: { value: 120, aggregation: 'average' },
      comparable: true,
      absoluteChange: 15
    })
  })

  test('allows explicit sleep-duration totals but rejects totals of percentages', () => {
    const datasets = new Map<string, AgentDataset>([
      [
        'sleep-daily',
        {
          tool: 'query_daily_metrics',
          data: {
            source: 'live',
            requestedRange: { start: '2026-07-01', end: '2026-07-04' },
            days: {
              '2026-07-01': { sleepMinutes: 420, sleepEfficiency: 94 },
              '2026-07-02': { sleepMinutes: 450, sleepEfficiency: 96 },
              '2026-07-03': { sleepMinutes: 480, sleepEfficiency: 95 },
              '2026-07-04': { sleepMinutes: 390, sleepEfficiency: 93 }
            }
          }
        }
      ]
    ])
    const comparison = {
      datasetId: 'sleep-daily',
      title: 'Sleep comparison',
      currentLabel: 'Recent nights',
      currentStartDate: '2026-07-03',
      currentEndDate: '2026-07-04',
      currentAggregation: 'total',
      previousLabel: 'Earlier nights',
      previousStartDate: '2026-07-01',
      previousEndDate: '2026-07-02',
      previousAggregation: 'total'
    }

    expect(resolvePresentation({ comparisons: [{ ...comparison, metric: 'sleepMinutes' }] }, datasets)[0]).toMatchObject({
      current: { value: 870, aggregation: 'total' },
      previous: { value: 870, aggregation: 'total' },
      comparable: true
    })
    expect(() => resolvePresentation({
      comparisons: [{ ...comparison, metric: 'sleepEfficiency' }]
    }, datasets)).toThrow('cannot be meaningfully totalled')
  })

  test('adds a trend fallback but does not visualize an external guideline comparison', () => {
    const datasets = dailyDatasets()
    expect(resolveAutomaticPresentation('Is my sleep trending up or down?', datasets)).toHaveLength(1)
    expect(resolveAutomaticPresentation('How do my steps compare with NHS recommendations?', datasets)).toEqual([])
    expect(resolveAutomaticPresentation('What is my current health compared with NHS ideals?', datasets)).toEqual([])
  })

  test('adds a sleep-stage card fallback for a specific-night breakdown', () => {
    expect(resolveAutomaticPresentation('How did I sleep last night?', sleepDatasets())[0]).toMatchObject({
      type: 'sleep-card',
      night: { date: '2026-07-11' }
    })
    expect(resolveAutomaticPresentation('How did I sleep this week?', sleepDatasets())).toEqual([])
  })

  test('adds the matching nutrition card fallback without substituting a trend card', () => {
    expect(resolveAutomaticPresentation('What did I eat for lunch?', nutritionDatasets())[0]).toMatchObject({
      type: 'nutrition-card',
      scope: 'meal',
      title: 'Lunch'
    })
    expect(resolveAutomaticPresentation('Show the nutrition for my Greek yogurt', nutritionDatasets())[0]).toMatchObject({
      type: 'nutrition-card',
      scope: 'item',
      title: 'Greek yogurt'
    })
    expect(resolveAutomaticPresentation('How was my nutrition this week?', nutritionDatasets())).toEqual([])
  })
})

import { describe, expect, test } from 'bun:test'
import {
  healthAgentModelData,
  pearsonCorrelation,
  summarizeMetricPoints
} from '../src/main/health-agent-analysis'

describe('health agent analysis', () => {
  test('reports coverage and a reproducible daily trend', () => {
    const summary = summarizeMetricPoints([
      { date: '2026-07-01', value: 60 },
      { date: '2026-07-02', value: null },
      { date: '2026-07-03', value: 64 }
    ])

    expect(summary.observations).toBe(2)
    expect(summary.missingDays).toBe(1)
    expect(summary.mean).toBe(62)
    expect(summary.changePct).toBeCloseTo(6.6667, 3)
    expect(summary.slopePerDay).toBe(2)
  })

  test('does not manufacture statistics from absent data', () => {
    expect(
      summarizeMetricPoints([
        { date: '2026-07-01', value: null },
        { date: '2026-07-02', value: null }
      ])
    ).toEqual({
      observations: 0,
      missingDays: 2,
      mean: null,
      min: null,
      max: null,
      first: null,
      last: null,
      changePct: null,
      slopePerDay: null
    })
  })

  test('calculates correlation locally and rejects tiny samples', () => {
    expect(pearsonCorrelation([[1, 2], [2, 4], [3, 6]])).toBeCloseTo(1)
    expect(pearsonCorrelation([[1, 2], [2, 4]])).toBeNull()
  })

  test('keeps presentation points local when returning analysis to the model', () => {
    const compact = healthAgentModelData('analyze_daily_metrics', {
      source: 'live',
      requestedRange: { start: '2026-07-01', end: '2026-07-03' },
      units: { restingHeartRate: 'bpm' },
      observations: { restingHeartRate: 3 },
      days: { '2026-07-01': { restingHeartRate: 61 } },
      range: { start: '2026-07-01', end: '2026-07-03', days: 3 },
      summaries: { restingHeartRate: { mean: 62 } }
    })

    expect(compact).toEqual({
      source: 'live',
      range: { start: '2026-07-01', end: '2026-07-03', days: 3 },
      summaries: { restingHeartRate: { mean: 62 } }
    })
    expect(JSON.stringify(compact)).not.toContain('restingHeartRate":61')
  })

  test('keeps the full sleep-stage timeline local while exposing its availability', () => {
    const compact = healthAgentModelData('query_sleep', {
      source: 'live',
      requestedRange: { start: '2026-07-11', end: '2026-07-11' },
      detail: 'summary',
      nights: [
        {
          date: '2026-07-11',
          minutesAsleep: 498,
          stages: [
            { type: 'LIGHT', startTime: '2026-07-10T23:00:00Z', endTime: '2026-07-10T23:30:00Z' }
          ],
          outOfBedSegments: [{ startTime: '2026-07-11T03:00:00Z', endTime: '2026-07-11T03:05:00Z' }]
        }
      ]
    })

    expect(compact).toMatchObject({
      nights: [{ date: '2026-07-11', minutesAsleep: 498, stageSegmentCount: 1, outOfBedSegmentCount: 1 }]
    })
    expect(JSON.stringify(compact)).not.toContain('2026-07-10T23:00:00Z')
  })

  test('converts fallback sleep timestamps using seasonal timezone rules', () => {
    const compact = healthAgentModelData(
      'query_sleep',
      {
        source: 'live',
        detail: 'summary',
        nights: [
          {
            date: '2026-07-14',
            startTime: '2026-07-14T00:23:00Z',
            endTime: '2026-07-14T10:12:00Z',
            stages: [],
            outOfBedSegments: []
          },
          {
            date: '2026-12-14',
            startTime: '2026-12-14T00:23:00Z',
            endTime: '2026-12-14T10:12:00Z',
            stages: [],
            outOfBedSegments: []
          }
        ]
      },
      'Europe/London'
    )

    expect(compact).toMatchObject({
      nights: [
        {
          localStartTime: '2026-07-14 01:23',
          localEndTime: '2026-07-14 11:12',
          timeZone: 'Europe/London'
        },
        {
          localStartTime: '2026-12-14 00:23',
          localEndTime: '2026-12-14 10:12',
          timeZone: 'Europe/London'
        }
      ]
    })
    expect(JSON.stringify(compact)).not.toContain('T00:23:00Z')
  })

  test('prefers tracker civil sleep times over timezone reconstruction', () => {
    const compact = healthAgentModelData(
      'query_sleep',
      {
        source: 'live',
        detail: 'summary',
        nights: [
          {
            date: '2026-07-14',
            startTime: '2026-07-14T00:23:00Z',
            endTime: '2026-07-14T10:12:00Z',
            startCivilDate: '2026-07-13',
            startCivilMinute: 23 * 60 + 23,
            endCivilMinute: 11 * 60 + 12,
            stages: [],
            outOfBedSegments: []
          }
        ]
      },
      'Europe/London'
    )

    expect(compact).toMatchObject({
      nights: [
        {
          localStartTime: '2026-07-13 23:23',
          localEndTime: '2026-07-14 11:12'
        }
      ]
    })
  })

  test('converts detailed out-of-bed periods without exposing UTC clock values', () => {
    const compact = healthAgentModelData(
      'query_sleep',
      {
        source: 'live',
        detail: 'detailed',
        nights: [
          {
            date: '2026-07-14',
            startTime: '2026-07-14T00:23:00Z',
            endTime: '2026-07-14T10:12:00Z',
            stages: [],
            outOfBedSegments: [
              { startTime: '2026-07-14T03:00:00Z', endTime: '2026-07-14T03:05:00Z' }
            ]
          }
        ]
      },
      'Europe/London'
    )

    expect(compact).toMatchObject({
      nights: [
        {
          outOfBedSegments: [
            { localStartTime: '2026-07-14 04:00', localEndTime: '2026-07-14 04:05' }
          ]
        }
      ]
    })
    expect(JSON.stringify(compact)).not.toContain('T03:00:00Z')
  })
})

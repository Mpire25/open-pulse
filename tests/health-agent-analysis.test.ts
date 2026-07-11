import { describe, expect, test } from 'bun:test'
import { pearsonCorrelation, summarizeMetricPoints } from '../src/main/health-agent-analysis'

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
})

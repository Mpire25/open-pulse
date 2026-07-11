import { describe, expect, test } from 'bun:test'
import { monthlyBuckets, weeklyAverageBuckets, type SeriesPoint } from '../src/renderer/src/lib/metrics'

describe('year chart buckets', () => {
  test('reduces a year to weekly daily averages for bar charts', () => {
    const points: SeriesPoint[] = Array.from({ length: 15 }, (_, index) => ({
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      value: index === 2 ? null : index + 1
    }))

    const buckets = weeklyAverageBuckets(points)

    expect(buckets).toHaveLength(3)
    expect(buckets[0]).toEqual({
      date: '2026-01-01',
      endDate: '2026-01-07',
      midpointDate: '2026-01-04',
      value: 25 / 6
    })
    expect(buckets[1].value).toBe(11)
    expect(buckets[2].value).toBe(15)
  })

  test('keeps empty weeks as gaps rather than zeroes', () => {
    const points: SeriesPoint[] = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-02-${String(index + 1).padStart(2, '0')}`,
      value: null
    }))

    expect(weeklyAverageBuckets(points)[0].value).toBeNull()
  })

  test('retains monthly aggregation for the history list', () => {
    const points: SeriesPoint[] = [
      { date: '2026-01-30', value: 70 },
      { date: '2026-01-31', value: 72 },
      { date: '2026-02-01', value: 73 }
    ]

    expect(monthlyBuckets(points, 'avg')).toEqual([
      { date: '2026-01-01', value: 71 },
      { date: '2026-02-01', value: 73 }
    ])
    expect(monthlyBuckets(points, 'last')[0].value).toBe(72)
  })
})

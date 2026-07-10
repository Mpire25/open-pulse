import { describe, expect, test } from 'bun:test'
import { sampleHeartRateForChart } from '../src/renderer/src/lib/heart-rate'

describe('heart-rate chart sampling', () => {
  test('keeps and distributes legacy readings that share a minute', () => {
    const sampled = sampleHeartRateForChart(
      [
        { minute: 120, bpm: 100 },
        { minute: 120, bpm: 110 },
        { minute: 121, bpm: 120 }
      ],
      100,
      120,
      122
    )

    expect(sampled).toEqual([
      { minute: 120, bpm: 100 },
      { minute: 120.5, bpm: 110 },
      { minute: 121, bpm: 120 }
    ])
  })

  test('keeps every received reading below the rendering cap', () => {
    const points = Array.from({ length: 397 }, (_, index) => ({ minute: 120 + index / 60, bpm: 90 + (index % 40) }))
    const sampled = sampleHeartRateForChart(points, 2000, 120, 132)

    expect(sampled).toHaveLength(397)
    expect(sampled.map((point) => point.bpm)).toEqual(points.map((point) => point.bpm))
  })

  test('averages dense readings into time-based buckets', () => {
    const points = Array.from({ length: 120 }, (_, index) => ({ minute: index / 2, bpm: 90 + (index % 20) }))
    const sampled = sampleHeartRateForChart(points, 12, 0, 60)

    expect(sampled).toHaveLength(12)
    expect(sampled[0].minute).toBeLessThan(sampled.at(-1)!.minute)
    expect(sampled.every((point) => Number.isInteger(point.bpm))).toBe(true)
  })
})

import { describe, expect, test } from 'bun:test'
import { lineAxis } from '../src/renderer/src/lib/chart-scale'

describe('line chart axis scaling', () => {
  test('keeps a weight trend close to its observed values', () => {
    const axis = lineAxis(73, 77)

    expect(axis.min).toBe(72.5)
    expect(axis.max).toBe(77.5)
    expect(axis.max - axis.min).toBeLessThanOrEqual(6)
  })

  test('does not anchor an intraday heart-rate range at zero', () => {
    const axis = lineAxis(60, 150)

    expect(axis.min).toBe(45)
    expect(axis.max).toBe(165)
    expect(axis.min).toBeGreaterThan(0)
  })

  test('gives a flat series a stable non-zero domain', () => {
    const axis = lineAxis(75, 75)

    expect(axis.min).toBeLessThan(75)
    expect(axis.max).toBeGreaterThan(75)
    expect(axis.ticks).toHaveLength(3)
  })
})

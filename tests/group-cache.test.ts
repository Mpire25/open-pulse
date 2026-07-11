import { describe, expect, test } from 'bun:test'
import {
  contiguousDateSpans,
  isPartialFetchCoolingDown,
  PARTIAL_FETCH_RETRY_MS,
  partialFetchGroupId,
  valuesToMerge
} from '../src/main/group-cache'

describe('partial fetch caching', () => {
  test('preserves archived values when a fallback fetch is incomplete', () => {
    const archived = { caloriesIn: 1800, sugarG: 42 }
    const partial = valuesToMerge(
      ['caloriesIn', 'sugarG'],
      { caloriesIn: 1900, sugarG: null },
      false
    )

    expect({ ...archived, ...partial }).toEqual({ caloriesIn: 1900, sugarG: 42 })
  })

  test('records explicit nulls after a complete fetch', () => {
    expect(valuesToMerge(['caloriesIn', 'sugarG'], { caloriesIn: 1900 }, true)).toEqual({
      caloriesIn: 1900,
      sugarG: null
    })
  })

  test('retries partial fetches after a short cooldown', () => {
    const now = 10_000_000
    const partialAt = now - 1_000

    expect(partialFetchGroupId('nutrition-v6')).toBe('nutrition-v6:partial')
    expect(isPartialFetchCoolingDown(partialAt, now)).toBe(true)
    expect(isPartialFetchCoolingDown(partialAt, now + PARTIAL_FETCH_RETRY_MS)).toBe(false)
  })
})

describe('contiguous date spans', () => {
  test('keeps separate holes separate while coalescing adjacent dates', () => {
    expect(contiguousDateSpans(['2026-07-01', '2026-07-02', '2026-07-05', '2026-07-07', '2026-07-08'])).toEqual([
      { start: '2026-07-01', end: '2026-07-02', dates: ['2026-07-01', '2026-07-02'] },
      { start: '2026-07-05', end: '2026-07-05', dates: ['2026-07-05'] },
      { start: '2026-07-07', end: '2026-07-08', dates: ['2026-07-07', '2026-07-08'] }
    ])
  })
})

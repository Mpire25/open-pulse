import { describe, expect, test } from 'bun:test'
import { isDelayedSkeletonVisible } from '../src/renderer/src/lib/loading-state'

describe('delayed skeleton visibility', () => {
  test('does not carry a revealed skeleton into a new pending request', () => {
    expect(isDelayedSkeletonVisible('2026-07-29', '2026-07-29')).toBe(true)
    expect(isDelayedSkeletonVisible('2026-07-30', '2026-07-29')).toBe(false)
  })

  test('stays hidden when there is no pending request', () => {
    expect(isDelayedSkeletonVisible(null, '2026-07-29')).toBe(false)
  })
})

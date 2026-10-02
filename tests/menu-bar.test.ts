import { describe, expect, test } from 'bun:test'
import { isMenuBarDestination, menuBarBounds } from '../src/shared/menu-bar'

describe('menu bar navigation boundary', () => {
  test('accepts dated daily and weekly chart links', () => {
    expect(isMenuBarDestination({ view: 'activity', date: '2026-10-01', metric: 'steps', range: 'W' })).toBe(true)
    expect(isMenuBarDestination({ view: 'heart', date: '2026-10-01', metric: 'hrvMs', range: 'D' })).toBe(true)
    expect(isMenuBarDestination({ view: 'settings', date: '2026-10-01' })).toBe(true)
    expect(isMenuBarDestination({ view: 'activity', date: '2026-10-01', metric: 'steps', range: '3M' })).toBe(true)
    expect(isMenuBarDestination({ view: 'heart', date: '2026-10-01', metric: 'hrvMs', range: 'Y' })).toBe(true)
  })
  test('rejects malformed dates and unsupported commands', () => {
    for (const value of [null, {}, { view: 'shell', date: '2026-10-01' },
      { view: 'sleep', date: '2026-02-30' }, { view: 'sleep', date: 'not-a-date' },
      { view: 'activity', date: '2026-10-01', metric: 'unknown' },
      { view: 'activity', date: '2026-10-01', range: '2Y' }]) {
      expect(isMenuBarDestination(value)).toBe(false)
    }
  })
})

describe('panel display placement', () => {
  test('fits content while keeping tall content within the display', () => {
    const anchor = { x: 800, y: 0, width: 20, height: 24 }
    const area = { x: 0, y: 24, width: 1440, height: 876 }
    expect(menuBarBounds(anchor, area, 540).height).toBe(540)
    expect(menuBarBounds(anchor, area, 1200)).toEqual({ x: 584, y: 24, width: 452, height: 876 })
  })
  test('clamps right edge and stays under the menu bar', () => {
    expect(menuBarBounds({ x: 1420, y: 0, width: 20, height: 24 }, { x: 0, y: 24, width: 1440, height: 876 }))
      .toEqual({ x: 988, y: 30, width: 452, height: 650 })
  })
  test('supports displays left of the primary display and short work areas', () => {
    expect(menuBarBounds({ x: -1270, y: 0, width: 20, height: 24 }, { x: -1280, y: 24, width: 1280, height: 576 }))
      .toEqual({ x: -1280, y: 24, width: 452, height: 576 })
  })
})

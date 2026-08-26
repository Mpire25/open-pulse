import { describe, expect, test } from 'bun:test'
import { millisecondsUntilNextLocalDay } from '../src/renderer/src/lib/current-day'
import { dateNavigationState } from '../src/renderer/src/lib/date-navigation'
import { navDateLabel } from '../src/renderer/src/lib/format'

describe('current day rollover', () => {
  test('schedules against the next local midnight', () => {
    const now = new Date(2026, 6, 14, 23, 59, 59, 500)
    expect(millisecondsUntilNextLocalDay(now)).toBe(500)
  })

  test('handles a year boundary', () => {
    const now = new Date(2026, 11, 31, 23, 59, 59)
    expect(millisecondsUntilNextLocalDay(now)).toBe(1_000)
  })

  test('reveals the new day without moving the viewed date', () => {
    expect(dateNavigationState('2026-08-26', '2026-08-27')).toEqual({
      showTodayShortcut: true,
      canGoForward: true
    })
    expect(navDateLabel('2026-08-26', '2026-08-27')).toBe('Yesterday')
  })

  test('keeps future dates bounded while still offering a return to today', () => {
    expect(dateNavigationState('2026-08-27', '2026-08-26')).toEqual({
      showTodayShortcut: true,
      canGoForward: false
    })
  })

  test('hides the shortcut and forward navigation when viewing today', () => {
    expect(dateNavigationState('2026-08-27', '2026-08-27')).toEqual({
      showTodayShortcut: false,
      canGoForward: false
    })
  })
})

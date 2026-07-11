import { describe, expect, test } from 'bun:test'
import {
  HorizontalScrollGestureLatch,
  TrackpadNavigationGesture
} from '../src/renderer/src/lib/trackpad-navigation'

describe('trackpad history navigation', () => {
  test('ignores vertical and strongly diagonal scrolling', () => {
    const gesture = new TrackpadNavigationGesture()

    expect(gesture.update(2, 20)).toEqual({ capture: false, navigation: null })
    expect(gesture.update(10, 9)).toEqual({ capture: false, navigation: null })
  })

  test('accumulates a horizontal swipe into back or forward navigation', () => {
    const backGesture = new TrackpadNavigationGesture()
    expect(backGesture.update(-30, 2).navigation).toBeNull()
    expect(backGesture.update(-30, 1).navigation).toBeNull()
    expect(backGesture.update(-30, 0).navigation).toBe('back')

    const forwardGesture = new TrackpadNavigationGesture()
    expect(forwardGesture.update(45, 2).navigation).toBeNull()
    expect(forwardGesture.update(45, 1).navigation).toBe('forward')
  })

  test('fires once through momentum and can navigate again after reset', () => {
    const gesture = new TrackpadNavigationGesture()

    expect(gesture.update(-90, 0).navigation).toBe('back')
    expect(gesture.update(-90, 0).navigation).toBeNull()
    gesture.reset()
    expect(gesture.update(90, 0).navigation).toBe('forward')
  })

  test('does not treat the rising part of one swipe as another page', () => {
    const gesture = new TrackpadNavigationGesture()

    expect(gesture.update(-30, 0).navigation).toBeNull()
    expect(gesture.update(-30, 0).navigation).toBeNull()
    expect(gesture.update(-30, 0).navigation).toBe('back')
    expect(gesture.update(-60, 0).navigation).toBeNull()
    expect(gesture.update(-50, 0).navigation).toBeNull()
    expect(gesture.update(-40, 0).navigation).toBeNull()
  })

  test('allows an immediate reverse gesture after navigating', () => {
    const gesture = new TrackpadNavigationGesture()

    expect(gesture.update(-90, 0).navigation).toBe('back')
    expect(gesture.update(45, 0).navigation).toBeNull()
    expect(gesture.update(45, 0).navigation).toBe('forward')
  })

  test('detects a second same-direction swipe through lingering momentum', () => {
    const gesture = new TrackpadNavigationGesture()

    expect(gesture.update(-90, 0).navigation).toBe('back')
    expect(gesture.update(-8, 0).navigation).toBeNull()
    expect(gesture.update(-2, 0).navigation).toBeNull()
    expect(gesture.update(-5, 0).navigation).toBeNull()
    expect(gesture.update(-80, 0).navigation).toBe('back')
  })

  test('does not re-arm from a vertical interruption within one swipe', () => {
    const gesture = new TrackpadNavigationGesture()

    expect(gesture.update(-90, 0).navigation).toBe('back')
    expect(gesture.update(-0.5, 20).navigation).toBeNull()
    expect(gesture.update(-20, 1).navigation).toBeNull()
    expect(gesture.update(-60, 1).navigation).toBeNull()
  })

  test('restarts accumulation when the swipe changes direction', () => {
    const gesture = new TrackpadNavigationGesture()

    expect(gesture.update(-50, 0).navigation).toBeNull()
    expect(gesture.update(50, 0).navigation).toBeNull()
    expect(gesture.update(40, 0).navigation).toBe('forward')
  })

  test('keeps momentum owned by a horizontal scroller after it reaches an edge', () => {
    const scrollGesture = new HorizontalScrollGestureLatch()

    expect(scrollGesture.update(true)).toBe(true)
    expect(scrollGesture.update(false)).toBe(true)
    expect(scrollGesture.update(false, true)).toBe(false)
  })
})

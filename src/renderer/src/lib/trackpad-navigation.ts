export type HistoryNavigationDirection = 'back' | 'forward'

export interface TrackpadGestureResult {
  capture: boolean
  navigation: HistoryNavigationDirection | null
}

const SWIPE_THRESHOLD = 80
const HORIZONTAL_DOMINANCE = 1.25
const MOMENTUM_TAIL_MAX_DELTA = 6
const MOMENTUM_TAIL_PEAK_RATIO = 0.35
const NEW_GESTURE_MIN_DELTA = 8
const NEW_GESTURE_ACCELERATION = 1.8

export function isHorizontalTrackpadDelta(deltaX: number, deltaY: number): boolean {
  const absX = Math.abs(deltaX)
  return absX >= 1 && absX > Math.abs(deltaY) * HORIZONTAL_DOMINANCE
}

// Once a wheel sequence starts inside a horizontal scroller, keep the whole
// sequence there. Otherwise momentum that reaches the edge can escape into a
// history navigation before the user's next deliberate gesture.
export class HorizontalScrollGestureLatch {
  private active = false

  update(canScroll: boolean, startsNewGesture = false): boolean {
    if (startsNewGesture) this.active = false
    if (canScroll) this.active = true
    return this.active
  }

  reset(): void {
    this.active = false
  }
}

// Trackpads emit a stream of wheel events, including momentum after the user's
// fingers lift. This recognizer turns that stream into at most one navigation.
export class TrackpadNavigationGesture {
  private accumulatedX = 0
  private triggered = false
  private previousAbsX = 0
  private postTriggerPeakX = 0
  private readyForNextSameDirection = false

  update(deltaX: number, deltaY: number): TrackpadGestureResult {
    const absX = Math.abs(deltaX)
    if (!isHorizontalTrackpadDelta(deltaX, deltaY)) {
      if (absX < 1) this.previousAbsX = absX
      return { capture: false, navigation: null }
    }

    const changedDirection = this.accumulatedX !== 0 && Math.sign(deltaX) !== Math.sign(this.accumulatedX)
    if (this.triggered && !changedDirection) {
      this.postTriggerPeakX = Math.max(this.postTriggerPeakX, absX)
      const tailThreshold = Math.min(
        MOMENTUM_TAIL_MAX_DELTA,
        this.postTriggerPeakX * MOMENTUM_TAIL_PEAK_RATIO
      )
      if (absX <= tailThreshold) this.readyForNextSameDirection = true
    }

    const hasNewSameDirectionImpulse =
      this.triggered &&
      !changedDirection &&
      this.readyForNextSameDirection &&
      absX >= NEW_GESTURE_MIN_DELTA &&
      absX >= this.previousAbsX * NEW_GESTURE_ACCELERATION

    if (changedDirection || hasNewSameDirectionImpulse) {
      this.accumulatedX = 0
      this.triggered = false
      this.postTriggerPeakX = 0
      this.readyForNextSameDirection = false
    }

    this.previousAbsX = absX
    this.accumulatedX += deltaX
    if (this.triggered || Math.abs(this.accumulatedX) < SWIPE_THRESHOLD) {
      return { capture: true, navigation: null }
    }

    this.triggered = true
    this.postTriggerPeakX = absX
    this.readyForNextSameDirection = false
    return {
      capture: true,
      navigation: this.accumulatedX < 0 ? 'back' : 'forward'
    }
  }

  reset(): void {
    this.accumulatedX = 0
    this.triggered = false
    this.previousAbsX = 0
    this.postTriggerPeakX = 0
    this.readyForNextSameDirection = false
  }
}

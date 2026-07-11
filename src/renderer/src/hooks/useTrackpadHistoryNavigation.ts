import { useEffect } from 'react'
import {
  HorizontalScrollGestureLatch,
  isHorizontalTrackpadDelta,
  TrackpadNavigationGesture
} from '@/lib/trackpad-navigation'

const GESTURE_END_DELAY_MS = 160
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) != null
}

function canScrollHorizontally(target: EventTarget | null, deltaX: number): boolean {
  if (!(target instanceof Element)) return false

  let element: Element | null = target
  while (element && element !== document.documentElement) {
    const maxScrollLeft = element.scrollWidth - element.clientWidth
    const overflowX = window.getComputedStyle(element).overflowX
    const isScrollable = maxScrollLeft > 1 && (overflowX === 'auto' || overflowX === 'scroll')

    if (isScrollable) {
      if (deltaX < 0 && element.scrollLeft > 1) return true
      if (deltaX > 0 && element.scrollLeft < maxScrollLeft - 1) return true
    }

    element = element.parentElement
  }

  return false
}

export function useTrackpadHistoryNavigation(): void {
  useEffect(() => {
    const gesture = new TrackpadNavigationGesture()
    const scrollGesture = new HorizontalScrollGestureLatch()
    let resetTimer: ReturnType<typeof setTimeout> | undefined

    const resetAfterMomentum = (): void => {
      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => {
        gesture.reset()
        scrollGesture.reset()
      }, GESTURE_END_DELAY_MS)
    }

    const handleWheel = (event: WheelEvent): void => {
      // Trackpads report pixel deltas. Leave line/page-based mouse wheels alone.
      if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return
      if (isEditableTarget(event.target)) {
        gesture.reset()
        scrollGesture.reset()
        return
      }

      const startsNewGesture = Math.abs(event.deltaX) < 1 && Math.abs(event.deltaY) < 1
      const horizontalInput = isHorizontalTrackpadDelta(event.deltaX, event.deltaY)
      const canScroll = horizontalInput && canScrollHorizontally(event.target, event.deltaX)
      if (scrollGesture.update(canScroll, startsNewGesture)) {
        gesture.reset()
        resetAfterMomentum()
        if (!canScroll && horizontalInput) event.preventDefault()
        return
      }

      const result = gesture.update(event.deltaX, event.deltaY)
      if (!result.capture) return

      event.preventDefault()
      resetAfterMomentum()

      if (result.navigation === 'back') window.history.back()
      if (result.navigation === 'forward') window.history.forward()
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      window.removeEventListener('wheel', handleWheel)
      if (resetTimer) clearTimeout(resetTimer)
    }
  }, [])
}

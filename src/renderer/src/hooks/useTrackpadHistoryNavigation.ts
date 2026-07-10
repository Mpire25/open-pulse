import { useEffect } from 'react'
import { TrackpadNavigationGesture } from '@/lib/trackpad-navigation'

const GESTURE_END_DELAY_MS = 160

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
    let resetTimer: ReturnType<typeof setTimeout> | undefined

    const resetAfterMomentum = (): void => {
      if (resetTimer) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => gesture.reset(), GESTURE_END_DELAY_MS)
    }

    const handleWheel = (event: WheelEvent): void => {
      // Trackpads report pixel deltas. Leave line/page-based mouse wheels alone.
      if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return
      if (canScrollHorizontally(event.target, event.deltaX)) {
        gesture.reset()
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

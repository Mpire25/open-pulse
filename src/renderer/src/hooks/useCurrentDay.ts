import { useCallback, useEffect, useRef, useState } from 'react'
import { millisecondsUntilNextLocalDay } from '@/lib/current-day'
import { isoToday } from '@/lib/format'

const MIDNIGHT_SETTLE_MS = 100

/**
 * A single reactive snapshot of the local calendar day for the app shell.
 * Timers cover an app left open overnight; focus and visibility checks cover
 * suspended timers, sleep/wake, and clock or timezone changes while inactive.
 */
export function useCurrentDay(): readonly [today: string, syncToday: () => void] {
  const [today, setToday] = useState(isoToday)
  const midnightTimerRef = useRef<number | undefined>(undefined)
  const updateToday = useCallback((): void => {
    const nextToday = isoToday()
    setToday((current) => (current === nextToday ? current : nextToday))
  }, [])
  const syncToday = useCallback((): void => {
    if (midnightTimerRef.current !== undefined) window.clearTimeout(midnightTimerRef.current)
    updateToday()
    midnightTimerRef.current = window.setTimeout(
      syncToday,
      millisecondsUntilNextLocalDay(new Date()) + MIDNIGHT_SETTLE_MS
    )
  }, [updateToday])

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (!document.hidden) syncToday()
    }

    syncToday()
    window.addEventListener('focus', syncToday)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (midnightTimerRef.current !== undefined) window.clearTimeout(midnightTimerRef.current)
      window.removeEventListener('focus', syncToday)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [syncToday])

  return [today, syncToday] as const
}

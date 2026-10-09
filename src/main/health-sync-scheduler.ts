// Runs the rolling background sync: shortly after launch, then hourly. Each
// sweep only fetches days that are missing or past their recheck window, so
// after the first backfill a sweep costs a handful of range requests.

import { syncRecentHistory } from './health-service'

const FIRST_SWEEP_DELAY_MS = 15_000
const SWEEP_INTERVAL_MS = 60 * 60_000

export function startHealthBackgroundSync(): () => void {
  let timer: NodeJS.Timeout | null = null
  let controller: AbortController | null = null
  let stopped = false

  const schedule = (delay: number): void => {
    if (stopped) return
    timer = setTimeout(() => void sweep(), delay)
    timer.unref?.()
  }

  const sweep = async (): Promise<void> => {
    controller = new AbortController()
    try {
      await syncRecentHistory(controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) console.warn('[health] background sync did not finish:', error)
    } finally {
      controller = null
      schedule(SWEEP_INTERVAL_MS)
    }
  }

  schedule(FIRST_SWEEP_DELAY_MS)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    controller?.abort()
  }
}

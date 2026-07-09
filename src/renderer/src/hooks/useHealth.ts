import { useCallback, useEffect, useRef, useState } from 'react'
import type { HealthDay, PairedDevice, SleepNight } from '@shared/types'

interface DayState {
  day: HealthDay | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * Snapshot for the selected date. While a new date loads, the previous
 * snapshot is kept so views can hold their last render at reduced opacity
 * instead of flashing a skeleton.
 */
export function useHealthDay(date: string): DayState {
  const [day, setDay] = useState<HealthDay | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSeq = useRef(0)

  const load = useCallback((force: boolean) => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    window.pulse.health
      .day(date, force)
      .then((d) => {
        if (seq === requestSeq.current) setDay(d)
      })
      .catch((err: unknown) => {
        if (seq === requestSeq.current) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false)
      })
  }, [date])

  useEffect(() => load(false), [load])
  const refresh = useCallback(() => load(true), [load])

  return { day, loading, error, refresh }
}

export function useSleepHistory(nights: number, endDate: string): SleepNight[] | null {
  const [data, setData] = useState<SleepNight[] | null>(null)
  useEffect(() => {
    let active = true
    window.pulse.health.sleep(nights, endDate).then((d) => {
      if (active) setData(d)
    })
    return () => {
      active = false
    }
  }, [nights, endDate])
  return data
}

export function useDevices(): { devices: PairedDevice[] | null; refresh: () => void } {
  const [devices, setDevices] = useState<PairedDevice[] | null>(null)
  const refresh = useCallback(() => {
    void window.pulse.health.devices().then(setDevices)
  }, [])
  useEffect(refresh, [refresh])
  return { devices, refresh }
}

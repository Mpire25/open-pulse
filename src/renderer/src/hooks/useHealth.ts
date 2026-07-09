import { useCallback, useEffect, useState } from 'react'
import type { DashboardToday, WeekSeries } from '@shared/types'

interface Loadable<T> {
  data: T | null
  loading: boolean
  error: string | null
  refresh: () => void
}

function useLoadable<T>(fetcher: () => Promise<T>): Loadable<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcher()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [fetcher])

  useEffect(refresh, [refresh])
  return { data, loading, error, refresh }
}

const fetchToday = (): Promise<DashboardToday> => window.pulse.health.today()
const fetchWeek = (): Promise<WeekSeries> => window.pulse.health.week()

export function useDashboard(): Loadable<DashboardToday> {
  return useLoadable(fetchToday)
}

export function useWeek(): Loadable<WeekSeries> {
  return useLoadable(fetchWeek)
}

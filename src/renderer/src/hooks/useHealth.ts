// Query hooks over the main process's domain-split health queries.
//
// TanStack Query gives every card its own cache entry: data already cached for
// the selected date renders instantly, uncached dates show their skeletons,
// and a global refresh invalidates everything after the main process drops its
// freshness markers. We deliberately do not borrow data from another query
// key: showing the previous date under a new date label is misleading.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  useIsFetching,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  ActivityIntradayMetric,
  ActivityIntradayResult,
  BodyMeasurementsResult,
  HeartDetailMetric,
  HeartDetailResult,
  IntradaySnapshot,
  MetricKey,
  NutritionLogEntry,
  PairedDevice,
  SeriesResult,
  SleepNight,
  Workout,
  WorkoutTrackResult
} from '@shared/types'

// Past days barely change once synced; today does. Query-side staleness is
// short — the main process's per-day freshness rules do the real work.
const STALE_MS = 60_000
let healthRequestSequence = 0

async function healthRequest<T>(
  signal: AbortSignal,
  invoke: (requestId: string) => Promise<T>
): Promise<T> {
  if (signal.aborted) throw new DOMException('The request was cancelled.', 'AbortError')
  const requestId = `${Date.now()}-${healthRequestSequence++}`
  const cancel = (): void => {
    void window.pulse.health.cancel(requestId)
  }
  signal.addEventListener('abort', cancel, { once: true })
  try {
    return await invoke(requestId)
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

export interface ProgressiveSeriesResult {
  data: SeriesResult | undefined
  /** True only until the first requested metric is available. */
  isPending: boolean
  isFetching: boolean
  isError: boolean
  error: unknown
  isMetricPending: (metric: MetricKey) => boolean
  refetch: () => Promise<void>
}

/**
 * Fetch each metric independently, then merge completed responses. This lets
 * a card fill in Steps while Calories or another slower data group is still
 * syncing, without ever borrowing values from a different date.
 */
export function useSeries(metrics: MetricKey[], start: string, end: string): ProgressiveSeriesResult {
  const queries = useQueries({
    queries: metrics.map((metric) => ({
      queryKey: ['series-metric', metric, start, end],
      queryFn: ({ signal }) => healthRequest(signal, (requestId) =>
        window.pulse.health.series(requestId, [metric], start, end)
      ),
      staleTime: STALE_MS
    }))
  })

  const data = useMemo(() => {
    const completed = queries.flatMap((query) => (query.data ? [query.data] : []))
    if (completed.length === 0) return undefined

    const days: SeriesResult['days'] = {}
    for (const result of completed) {
      for (const [date, values] of Object.entries(result.days)) {
        days[date] = { ...days[date], ...values }
      }
    }
    return { source: completed[0].source, start, end, days }
  }, [queries, start, end])

  const pendingByMetric = new Map(metrics.map((metric, index) => [metric, queries[index]?.isPending ?? true]))
  const errors = queries.filter((query) => query.isError)

  return {
    data,
    isPending: queries.every((query) => query.isPending),
    isFetching: queries.some((query) => query.isFetching),
    isError: errors.length === queries.length && queries.length > 0,
    error: errors[0]?.error,
    isMetricPending: (metric) => pendingByMetric.get(metric) ?? false,
    refetch: async () => {
      await Promise.all(queries.map((query) => query.refetch()))
    }
  }
}

export function useSleepRange(start: string, end: string): UseQueryResult<SleepNight[]> {
  return useQuery({
    queryKey: ['sleep', start, end],
    queryFn: ({ signal }) => healthRequest(signal, async (requestId) =>
      (await window.pulse.health.sleepRange(requestId, start, end)).nights
    ),
    staleTime: STALE_MS
  })
}

export function useSleepNight(date: string): UseQueryResult<SleepNight | null> {
  return useQuery({
    queryKey: ['sleep-night', date],
    queryFn: ({ signal }) => healthRequest(signal, async (requestId) => {
      const result = await window.pulse.health.sleepRange(requestId, date, date)
      return result.nights.find((n) => n.date === date) ?? null
    }),
    staleTime: STALE_MS
  })
}

export function useWorkouts(start: string, end: string): UseQueryResult<Workout[]> {
  return useQuery({
    queryKey: ['workouts', start, end],
    queryFn: ({ signal }) => healthRequest(signal, async (requestId) =>
      (await window.pulse.health.workouts(requestId, start, end)).workouts
    ),
    staleTime: STALE_MS
  })
}

export function useWorkoutTrack(workoutId: string, enabled: boolean): UseQueryResult<WorkoutTrackResult> {
  return useQuery({
    queryKey: ['workout-track', workoutId],
    queryFn: ({ signal }) => healthRequest(signal, (requestId) =>
      window.pulse.health.workoutTrack(requestId, workoutId)
    ),
    staleTime: Infinity,
    enabled
  })
}

export function useIntraday(date: string, enabled = true): UseQueryResult<IntradaySnapshot> {
  return useQuery({
    queryKey: ['intraday', date],
    queryFn: ({ signal }) => healthRequest(signal, (requestId) =>
      window.pulse.health.intraday(requestId, date)
    ),
    staleTime: STALE_MS,
    enabled
  })
}

export function useActivityIntraday(
  date: string,
  metric: ActivityIntradayMetric,
  enabled = true
): UseQueryResult<ActivityIntradayResult> {
  return useQuery({
    queryKey: ['activity-intraday', metric, date],
    queryFn: ({ signal }) => healthRequest(signal, (requestId) =>
      window.pulse.health.activityIntraday(requestId, date, metric)
    ),
    staleTime: STALE_MS,
    enabled
  })
}

export function useHeartDetail(
  date: string,
  metric: HeartDetailMetric,
  enabled = true
): UseQueryResult<HeartDetailResult> {
  return useQuery({
    queryKey: ['heart-detail', metric, date],
    queryFn: ({ signal }) => healthRequest(signal, (requestId) =>
      window.pulse.health.heartDetail(requestId, date, metric)
    ),
    staleTime: STALE_MS,
    enabled
  })
}

export function useNutritionLogs(date: string): UseQueryResult<NutritionLogEntry[]> {
  return useQuery({
    // Versioned because the parsed entry shape now retains secondary
    // nutrients; do not reuse entries cached before those fields existed.
    queryKey: ['nutrition-logs-v2', date],
    queryFn: ({ signal }) => healthRequest(signal, async (requestId) =>
      (await window.pulse.health.nutritionLogs(requestId, date)).entries
    ),
    staleTime: STALE_MS
  })
}

export function useBodyMeasurements(start: string, end: string): UseQueryResult<BodyMeasurementsResult> {
  return useQuery({
    // Versioned because the result now includes the static height input used
    // for BMI; don't reuse the previous measurements-only response.
    queryKey: ['body-measurements-v2', start, end],
    queryFn: ({ signal }) => healthRequest(signal, (requestId) =>
      window.pulse.health.bodyMeasurements(requestId, start, end)
    ),
    staleTime: STALE_MS
  })
}

export function useDevices(): UseQueryResult<PairedDevice[]> {
  return useQuery({
    queryKey: ['devices'],
    queryFn: ({ signal }) => healthRequest(signal, (requestId) =>
      window.pulse.health.devices(requestId)
    ),
    staleTime: 5 * 60_000
  })
}

/**
 * Global refresh: the main process drops freshness (keeping values so the UI
 * stays populated), then every mounted query refetches.
 */
export function useRefresh(): () => Promise<void> {
  const queryClient = useQueryClient()
  return useCallback(async () => {
    await window.pulse.health.refresh()
    await queryClient.invalidateQueries()
  }, [queryClient])
}

/** True while anything is loading — renderer queries or main-process API calls. */
export function useSyncBusy(): boolean {
  const fetching = useIsFetching()
  const [pending, setPending] = useState(0)
  useEffect(() => window.pulse.health.onActivity((activity) => setPending(activity.pending)), [])
  return fetching > 0 || pending > 0
}

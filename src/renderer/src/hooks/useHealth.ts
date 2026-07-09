// Query hooks over the main process's domain-split health queries.
//
// TanStack Query gives every card its own cache entry: cached data renders
// instantly (stale-while-revalidate), date changes keep the previous window
// on screen while the new one loads, and a global refresh invalidates
// everything after the main process drops its freshness markers.

import { useCallback, useEffect, useState } from 'react'
import {
  keepPreviousData,
  useIsFetching,
  useQuery,
  useQueryClient,
  type UseQueryResult
} from '@tanstack/react-query'
import type {
  IntradaySnapshot,
  MetricKey,
  PairedDevice,
  SeriesResult,
  SleepNight,
  Workout
} from '@shared/types'

// Past days barely change once synced; today does. Query-side staleness is
// short — the main process's per-day freshness rules do the real work.
const STALE_MS = 60_000

export function useSeries(metrics: MetricKey[], start: string, end: string): UseQueryResult<SeriesResult> {
  return useQuery({
    queryKey: ['series', start, end, metrics.join('|')],
    queryFn: () => window.pulse.health.series(metrics, start, end),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData
  })
}

export function useSleepRange(start: string, end: string): UseQueryResult<SleepNight[]> {
  return useQuery({
    queryKey: ['sleep', start, end],
    queryFn: async () => (await window.pulse.health.sleepRange(start, end)).nights,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData
  })
}

export function useSleepNight(date: string): UseQueryResult<SleepNight | null> {
  return useQuery({
    queryKey: ['sleep-night', date],
    queryFn: async () => {
      const result = await window.pulse.health.sleepRange(date, date)
      return result.nights.find((n) => n.date === date) ?? null
    },
    staleTime: STALE_MS,
    placeholderData: keepPreviousData
  })
}

export function useWorkouts(start: string, end: string): UseQueryResult<Workout[]> {
  return useQuery({
    queryKey: ['workouts', start, end],
    queryFn: async () => (await window.pulse.health.workouts(start, end)).workouts,
    staleTime: STALE_MS,
    placeholderData: keepPreviousData
  })
}

export function useIntraday(date: string): UseQueryResult<IntradaySnapshot> {
  return useQuery({
    queryKey: ['intraday', date],
    queryFn: () => window.pulse.health.intraday(date),
    staleTime: STALE_MS,
    placeholderData: keepPreviousData
  })
}

export function useDevices(): UseQueryResult<PairedDevice[]> {
  return useQuery({
    queryKey: ['devices'],
    queryFn: () => window.pulse.health.devices(),
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

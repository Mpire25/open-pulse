import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { DashboardLayouts } from '@shared/dashboard'

const KEY = ['dashboard-layouts'] as const
export function useDashboardLayouts() {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => window.pulse.dashboard.get(),
    staleTime: Infinity
  })
  useEffect(
    () =>
      window.pulse.dashboard.onChanged((layouts) => {
        // Cancel an older in-flight read before installing the broadcast value.
        void client.cancelQueries({ queryKey: KEY }).then(() => client.setQueryData(KEY, layouts))
      }),
    [client]
  )
  const saved = (layouts: DashboardLayouts): void => {
    client.setQueryData(KEY, layouts)
  }
  return { ...query, saved }
}

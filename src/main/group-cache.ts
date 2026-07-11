import type { DayValues, MetricKey } from '../shared/types'

export const PARTIAL_FETCH_RETRY_MS = 5 * 60_000

export function partialFetchGroupId(groupId: string): string {
  return `${groupId}:partial`
}

export function isPartialFetchCoolingDown(partialFetchedAt: number | null, now = Date.now()): boolean {
  return partialFetchedAt != null && now - partialFetchedAt < PARTIAL_FETCH_RETRY_MS
}

/**
 * Complete fetches record explicit nulls. Partial fetches only merge values
 * they actually observed so a failed fallback cannot erase archived data.
 */
export function valuesToMerge(
  metrics: MetricKey[],
  fetched: DayValues | undefined,
  complete: boolean
): DayValues {
  const values: DayValues = {}
  for (const metric of metrics) {
    const value = fetched?.[metric]
    if (complete || value != null) values[metric] = value ?? null
  }
  return values
}

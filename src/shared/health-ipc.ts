export interface HealthRequestMarker {
  healthRequestId: string
}

export interface HealthCancelledMarker {
  healthRequestCancelled: true
}

export const HEALTH_CANCELLED: HealthCancelledMarker = { healthRequestCancelled: true }

export function isHealthCancelled(value: unknown): value is HealthCancelledMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    'healthRequestCancelled' in value &&
    value.healthRequestCancelled === true
  )
}

export function healthWireArgs<Args extends unknown[]>(
  args: Args,
  requestId: string
): [...Args, HealthRequestMarker] {
  return [...args, { healthRequestId: requestId }]
}

export function splitHealthWireArgs(wireArgs: unknown[]): {
  args: unknown[]
  requestId: string | null
} {
  const marker = wireArgs.at(-1)
  if (
    typeof marker !== 'object' ||
    marker === null ||
    !('healthRequestId' in marker) ||
    typeof marker.healthRequestId !== 'string' ||
    marker.healthRequestId.length === 0
  ) {
    return { args: wireArgs, requestId: null }
  }
  return { args: wireArgs.slice(0, -1), requestId: marker.healthRequestId }
}

export interface HealthRequestMarker {
  healthRequestId: string
}

export interface HealthCancelledMarker {
  healthRequestCancelled: true
}

export interface HealthErrorMarker {
  healthRequestError: true
  message: string
}

export const HEALTH_CANCELLED: HealthCancelledMarker = { healthRequestCancelled: true }

export function healthError(message: string): HealthErrorMarker {
  return { healthRequestError: true, message }
}

export function isHealthCancelled(value: unknown): value is HealthCancelledMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    'healthRequestCancelled' in value &&
    value.healthRequestCancelled === true
  )
}

export function isHealthError(value: unknown): value is HealthErrorMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    'healthRequestError' in value &&
    value.healthRequestError === true &&
    'message' in value &&
    typeof value.message === 'string'
  )
}

export function unwrapHealthResult<T>(value: unknown): T {
  if (isHealthCancelled(value)) throw new DOMException('The request was cancelled.', 'AbortError')
  if (isHealthError(value)) throw new Error(value.message)
  return value as T
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

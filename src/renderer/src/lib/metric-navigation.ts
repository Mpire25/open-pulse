import type { MetricKey } from '@shared/types'

export type MetricRange = 'D' | 'W' | 'M' | '3M' | 'Y'

/**
 * A metric entry point declares the range represented by its visible content.
 * This keeps selected-day tiles and longer trend charts from opening the same
 * generic detail state.
 */
export type OpenMetric = (metric: MetricKey, initialRange: MetricRange) => void

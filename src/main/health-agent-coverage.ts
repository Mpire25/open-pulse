import { METRIC_KEYS } from '../shared/types'
import type { ArchivedMetricCoverage } from './metric-store'

/**
 * Tells the model what history exists before it decides what to query, so it
 * never mistakes a narrow view of the data for missing data.
 */
export function dataCoverageContext(
  coverage: Record<string, ArchivedMetricCoverage>,
  today: string
): string {
  const lines = METRIC_KEYS.flatMap((metric) => {
    const entry = coverage[metric]
    return entry ? [`${metric}: ${entry.days} day${entry.days === 1 ? '' : 's'}, ${entry.first} to ${entry.last}`] : []
  })
  return [
    '<OPENPULSE_DATA_COVERAGE>',
    `Today is ${today}. Today's activity and nutrition totals are still accumulating.`,
    'The health tools read any date range of the user\'s Google Health history and fetch whatever is not cached locally. The local cache below is a lower bound: a short or missing range here never means the history does not exist. Query the relevant range before concluding that data is unavailable.',
    lines.length
      ? `Locally cached daily values (days with a value, first to last date):\n${lines.join('\n')}`
      : 'No daily values are cached locally yet.',
    '</OPENPULSE_DATA_COVERAGE>'
  ].join('\n')
}

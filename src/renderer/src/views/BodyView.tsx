import { motion } from 'framer-motion'
import { Scales } from '@phosphor-icons/react'
import { DrillHeader, InteractivePanel, Panel, SectionHeader } from '@/components/Panel'
import { TrendLine } from '@/components/charts'
import { CARD_HEIGHT, SkeletonChart, SkeletonText } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useBodyMeasurements, useSeries } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { latestPoint, rangeEnding, seriesPoints } from '@/lib/metrics'
import { formatClock, longDate, shortDate, weekdayShort } from '@/lib/format'
import type { OpenMetric } from '@/lib/metric-navigation'
import { fade } from '@/lib/motion'
import type { MetricKey } from '@shared/types'

const BODY_KEYS: MetricKey[] = ['weightKg', 'bodyFatPct']

interface BodyViewProps {
  date: string
  onOpenMetric: OpenMetric
}

// Body measurements are sparse (few people weigh in daily), so this view
// reads a 30-day window — enough points for the trend to mean something.
export function BodyView({ date, onOpenMetric }: BodyViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 30)
  const series = useSeries(BODY_KEYS, start, end)
  const measurements = useBodyMeasurements(start, end)

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const pointsFor = (key: MetricKey) => seriesPoints(days, key, start, end)

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Body</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(date)} · last 30 days of measurements</p>
      </motion.header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {BODY_KEYS.map((key, i) => {
          const def = METRICS[key]
          const points = pointsFor(key)
          const last = latestPoint(points)
          const Icon = def.icon
          const pending = series.isMetricPending(key)
          const hasData = points.some((point) => point.value != null)
          return (
            <motion.div key={key} custom={i + 1} variants={fade} initial="hidden" animate="show">
              <InteractivePanel
                className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.chart}`}
                onOpen={() => onOpenMetric(key, 'M')}
              >
                <DrillHeader
                  title={def.label}
                  hint={def.hint}
                  icon={<Icon size={18} weight="fill" style={{ color: def.color }} />}
                  action={
                    pending ? (
                      <SkeletonText className="h-5 w-20" />
                    ) : last?.value != null ? (
                      <span className="text-[20px] font-semibold text-ink">
                        {def.format(last.value)}{' '}
                        <span className="text-[12px] font-normal text-ink-dim">{def.unit}</span>
                      </span>
                    ) : undefined
                  }
                />
                {pending ? (
                  <SkeletonChart />
                ) : hasData ? (
                  <TrendLine
                    data={points.map((p) => ({
                      date: p.date,
                      label: `${weekdayShort(p.date)} · ${shortDate(p.date)}`,
                      value: p.value
                    }))}
                    color={def.color}
                    format={def.format}
                    unitLabel={def.unit}
                  />
                ) : (
                  <div className="grid h-[150px] place-items-center text-center text-[12px] text-ink-faint">
                    Nothing logged in this window
                  </div>
                )}
              </InteractivePanel>
            </motion.div>
          )
        })}
      </div>

      <motion.div custom={3} variants={fade} initial="hidden" animate="show">
        {measurements.isPending ? (
          <BodyMeasurementsSkeleton />
        ) : measurements.isError ? (
          <Panel className="px-5 py-4 text-[12px] text-ink-faint">
            Individual measurement details could not be loaded.
          </Panel>
        ) : measurements.data && measurements.data.length > 0 ? (
          <Panel className="overflow-hidden">
            <div className="border-b border-hairline px-5 pb-3 pt-4">
              <SectionHeader
                title="Recent measurements"
                hint="Individual scale readings"
                icon={<Scales size={18} weight="fill" style={{ color: 'var(--color-body-metric)' }} />}
              />
            </div>
            <div className="divide-y divide-hairline">
              {[...measurements.data].reverse().slice(0, 10).map((measurement) => (
                <div
                  key={measurement.id}
                  className="grid grid-cols-1 gap-2 px-5 py-3.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:items-center sm:gap-5"
                >
                  <div>
                    <div className="text-[12px] font-medium text-ink-dim">{measurementDate(measurement.time)}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-ink-faint">{formatClock(measurement.time)}</div>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
                    {measurement.weightKg != null && (
                      <MeasurementValue label="Weight" value={measurement.weightKg.toFixed(2)} unit="kg" />
                    )}
                    {measurement.bodyFatPct != null && (
                      <MeasurementValue label="Body fat" value={measurement.bodyFatPct.toFixed(1)} unit="%" />
                    )}
                    {measurement.notes && (
                      <span title={measurement.notes} className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
                        {measurement.notes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </motion.div>
    </div>
  )
}

function measurementDate(time: string): string {
  return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function MeasurementValue({ label, value, unit }: { label: string; value: string; unit: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10.5px] text-ink-faint">{label}</span>
      <span className="font-mono text-[13px] font-medium text-ink">
        {value} <span className="text-[10px] text-ink-dim">{unit}</span>
      </span>
    </div>
  )
}

function BodyMeasurementsSkeleton(): React.JSX.Element {
  return (
    <Panel className="overflow-hidden" aria-hidden>
      <div className="border-b border-hairline px-5 pb-3 pt-4">
        <SkeletonText className="h-4 w-36" />
        <SkeletonText className="mt-2 w-28" />
      </div>
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="grid grid-cols-1 gap-3 border-b border-hairline px-5 py-3.5 last:border-b-0 sm:grid-cols-[140px_1fr] sm:gap-5">
          <div className="flex flex-col gap-2">
            <SkeletonText className="w-16" />
            <SkeletonText className="h-2.5 w-12" />
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <SkeletonText className="h-4 w-24" />
            <SkeletonText className="h-4 w-24" />
          </div>
        </div>
      ))}
    </Panel>
  )
}

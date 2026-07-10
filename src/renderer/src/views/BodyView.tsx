import { motion } from 'framer-motion'
import { DrillHeader, InteractivePanel } from '@/components/Panel'
import { TrendLine } from '@/components/charts'
import { CARD_HEIGHT, SkeletonChart, SkeletonText } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useSeries } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { latestPoint, rangeEnding, seriesPoints } from '@/lib/metrics'
import { longDate, shortDate, weekdayShort } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { MetricKey } from '@shared/types'

const BODY_KEYS: MetricKey[] = ['weightKg', 'bodyFatPct']

interface BodyViewProps {
  date: string
  onOpenMetric: (metric: MetricKey) => void
}

// Body measurements are sparse (few people weigh in daily), so this view
// reads a 30-day window — enough points for the trend to mean something.
export function BodyView({ date, onOpenMetric }: BodyViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 30)
  const series = useSeries(BODY_KEYS, start, end)

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
                  onOpen={() => onOpenMetric(key)}
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
    </div>
  )
}

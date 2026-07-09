import { motion } from 'framer-motion'
import { Panel, DrillHeader } from '@/components/Panel'
import { TrendLine } from '@/components/charts'
import { CARD_HEIGHT, Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useSeries } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { latestPoint, metricAbsent, rangeEnding, seriesPoints } from '@/lib/metrics'
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
  const visible = series.data ? BODY_KEYS.filter((key) => !metricAbsent(pointsFor(key))) : []

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Body</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(date)} · last 30 days of measurements</p>
      </motion.header>

      {series.isPending ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Skeleton className={CARD_HEIGHT.chart} />
          <Skeleton className={CARD_HEIGHT.chart} />
        </div>
      ) : visible.length === 0 ? (
        <Panel className="grid place-items-center p-12 text-center text-[13px] leading-relaxed text-ink-faint">
          Nothing logged in this window. Weight and body-fat entries from the Fitbit app appear here.
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {visible.map((key, i) => {
            const def = METRICS[key]
            const points = pointsFor(key)
            const last = latestPoint(points)
            const Icon = def.icon
            return (
              <motion.div key={key} custom={i + 1} variants={fade} initial="hidden" animate="show">
                <Panel className={`flex flex-col gap-4 p-6 ${CARD_HEIGHT.chart}`}>
                  <DrillHeader
                    title={def.label}
                    hint={def.hint}
                    icon={<Icon size={18} weight="fill" style={{ color: def.color }} />}
                    action={
                      last?.value != null ? (
                        <span className="text-[20px] font-semibold text-ink">
                          {def.format(last.value)}{' '}
                          <span className="text-[12px] font-normal text-ink-dim">{def.unit}</span>
                        </span>
                      ) : undefined
                    }
                    onOpen={() => onOpenMetric(key)}
                  />
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
                </Panel>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

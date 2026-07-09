import { motion } from 'framer-motion'
import { Heartbeat } from '@phosphor-icons/react'
import { Panel, DrillHeader } from '@/components/Panel'
import { IntradayLine, TrendLine } from '@/components/charts'
import { DeltaChip } from '@/components/DeltaChip'
import { CARD_HEIGHT, Skeleton } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useIntraday, useSeries } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { baseline, baselineDeltaPct, metricAbsent, rangeEnding, seriesPoints } from '@/lib/metrics'
import { longDate, shortDate, weekdayShort } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { MetricKey } from '@shared/types'

const VITAL_KEYS: MetricKey[] = ['restingHeartRate', 'hrvMs', 'spo2Pct', 'breathingRate', 'skinTempDeltaC', 'vo2Max']

interface HeartViewProps {
  date: string
  onOpenMetric: (metric: MetricKey) => void
}

export function HeartView({ date, onOpenMetric }: HeartViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 7)
  const series = useSeries(VITAL_KEYS, start, end)
  const intraday = useIntraday(date)

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const pointsFor = (key: MetricKey) => seriesPoints(days, key, start, end)
  const visible = series.data ? VITAL_KEYS.filter((key) => !metricAbsent(pointsFor(key))) : []

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Heart</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(date)}</p>
      </motion.header>

      {/* Intraday heart rate */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        {intraday.isPending ? (
          <Skeleton className={CARD_HEIGHT.large} />
        ) : intraday.data && intraday.data.heartRate.length > 1 ? (
          <Panel className={`flex flex-col gap-4 p-6 ${CARD_HEIGHT.large}`}>
            <DrillHeader
              title="Heart rate"
              hint="Across the day"
              icon={<Heartbeat size={18} weight="fill" style={{ color: 'var(--color-heart)' }} />}
              action={
                intraday.data.currentHeartRate != null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[20px] font-semibold text-ink">{intraday.data.currentHeartRate}</span>
                    <span className="text-[12px] text-ink-dim">bpm now</span>
                  </div>
                ) : days?.[date]?.restingHeartRate != null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[20px] font-semibold text-ink">{days[date].restingHeartRate}</span>
                    <span className="text-[12px] text-ink-dim">bpm resting</span>
                  </div>
                ) : undefined
              }
              onOpen={() => onOpenMetric('restingHeartRate')}
            />
            <IntradayLine points={intraday.data.heartRate} color="var(--color-heart)" />
          </Panel>
        ) : null}
      </motion.div>

      {series.isPending ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Skeleton className={CARD_HEIGHT.chart} />
          <Skeleton className={CARD_HEIGHT.chart} />
          <Skeleton className={CARD_HEIGHT.chart} />
          <Skeleton className={CARD_HEIGHT.chart} />
        </div>
      ) : visible.length === 0 && (intraday.data?.heartRate.length ?? 0) <= 1 ? (
        <Panel className="grid place-items-center p-12 text-[13px] text-ink-faint">
          No vitals recorded in this window yet. They appear after your tracker syncs a night of data.
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {visible.map((key, i) => (
            <VitalCard
              key={key}
              metricKey={key}
              date={date}
              points={pointsFor(key)}
              index={i + 2}
              onOpen={() => onOpenMetric(key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function VitalCard({
  metricKey,
  date,
  points,
  index,
  onOpen
}: {
  metricKey: MetricKey
  date: string
  points: ReturnType<typeof seriesPoints>
  index: number
  onOpen: () => void
}): React.JSX.Element {
  const def = METRICS[metricKey]
  const value = points.find((p) => p.date === date)?.value ?? null
  const base = baseline(points, date)
  const Icon = def.icon
  return (
    <motion.div custom={index} variants={fade} initial="hidden" animate="show">
      <Panel className={`flex flex-col gap-4 p-6 ${CARD_HEIGHT.chart}`}>
        <DrillHeader
          title={def.label}
          hint={def.hint}
          icon={<Icon size={18} weight="fill" style={{ color: def.color }} />}
          action={
            <div className="flex items-center gap-2">
              {def.deltaMode !== 'abs' && (
                <DeltaChip delta={baselineDeltaPct(value, base)} upIsGood={def.upIsGood} />
              )}
              <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-semibold tracking-tight text-ink">
                  {value != null ? def.format(value) : '—'}
                </span>
                <span className="text-[11.5px] text-ink-dim">{def.unit}</span>
              </div>
            </div>
          }
          onOpen={onOpen}
        />
        <TrendLine
          data={points.map((p) => ({
            date: p.date,
            label: `${weekdayShort(p.date)} · ${shortDate(p.date)}`,
            value: p.value
          }))}
          color={def.color}
          height={130}
          format={def.format}
          baseline={
            def.deltaMode === 'abs'
              ? { value: 0, label: 'baseline' }
              : base != null
                ? { value: base, label: '7d avg' }
                : null
          }
          unitLabel={def.unit}
        />
      </Panel>
    </motion.div>
  )
}

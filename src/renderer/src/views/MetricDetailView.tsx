// Drill-in page for any daily metric: range tabs (D/W/M/3M/Y), a large chart,
// period stats with a previous-period comparison, and a recent history list.
// One data-driven page — the registry decides naming, color, chart type, and
// aggregation, so every metric behaves identically.

import { motion } from 'framer-motion'
import { ArrowLeft } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { ColumnChart, IntradayLine, ProgressRing, TrendLine } from '@/components/charts'
import { DeltaChip } from '@/components/DeltaChip'
import { CARD_HEIGHT, SkeletonBlock, SkeletonChart, SkeletonRing, SkeletonText } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useActivityIntraday, useHeartDetail, useIntraday, useSeries } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import {
  aggregatePoints,
  baseline,
  baselineDeltaPct,
  latestPoint,
  monthlyBuckets,
  rangeEnding,
  seriesPoints,
  weeklyAverageBuckets,
  type SeriesPoint,
  type WeeklySeriesPoint
} from '@/lib/metrics'
import { formatHour, formatInt, formatMinuteOfDay, longDate, shortDate, weekdayShort } from '@/lib/format'
import type { MetricRange } from '@/lib/metric-navigation'
import { fade } from '@/lib/motion'
import { isActivityIntradayMetric, isHeartDetailMetric } from '@shared/types'
import type {
  ActivityIntradayMetric,
  ActivityIntradayResult,
  Goals,
  HeartDetailResult,
  MetricKey
} from '@shared/types'
import { cn } from '@/lib/utils'

// days shown; fetched = shown + previous period for the comparison chip.
const RANGES: Array<{ id: MetricRange; label: string; days: number; fetchDays: number }> = [
  { id: 'D', label: 'D', days: 1, fetchDays: 14 },
  { id: 'W', label: 'W', days: 7, fetchDays: 14 },
  { id: 'M', label: 'M', days: 30, fetchDays: 60 },
  { id: '3M', label: '3M', days: 90, fetchDays: 180 },
  { id: 'Y', label: 'Y', days: 365, fetchDays: 365 }
]

const SUMMARY_ONLY_DAILY_METRICS = new Set<MetricKey>(['hrvMs', 'spo2Pct', 'breathingRate', 'skinTempDeltaC'])

interface MetricDetailViewProps {
  metricKey: MetricKey
  range: MetricRange
  date: string
  goals: Goals
  onBack: () => void
  onRangeChange: (range: MetricRange) => void
  onSelectDate: (date: string) => void
}

export function MetricDetailView({
  metricKey,
  range,
  date,
  goals,
  onBack,
  onRangeChange,
  onSelectDate
}: MetricDetailViewProps): React.JSX.Element {
  const def = METRICS[metricKey]
  const spec = RANGES.find((r) => r.id === range)!

  const fetchWindow = rangeEnding(date, spec.fetchDays)
  const series = useSeries([metricKey], fetchWindow.start, fetchWindow.end)
  // Intraday detail exists for steps (hourly) and heart rate (bpm curve).
  const wantsIntraday = range === 'D' && (metricKey === 'steps' || metricKey === 'restingHeartRate')
  const activityMetric = isActivityIntradayMetric(metricKey) ? metricKey : null
  const wantsActivityIntraday = range === 'D' && activityMetric != null
  const heartMetric = isHeartDetailMetric(metricKey) ? metricKey : null
  const wantsHeartDetail = range === 'D' && heartMetric != null
  const intradayScope = metricKey === 'steps' ? 'steps' : 'heart'
  const intraday = useIntraday(date, wantsIntraday, intradayScope)
  const activityIntraday = useActivityIntraday(date, activityMetric ?? 'distanceKm', wantsActivityIntraday)
  const heartDetail = useHeartDetail(date, heartMetric ?? 'restingHeartRate', wantsHeartDetail)

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const shown = rangeEnding(date, spec.days)
  const points = seriesPoints(days, metricKey, shown.start, shown.end)
  const prevPoints = seriesPoints(
    days,
    metricKey,
    rangeEnding(shiftBack(shown.start), spec.days).start,
    shiftBack(shown.start)
  )
  const contextPoints = seriesPoints(days, metricKey, fetchWindow.start, fetchWindow.end)

  const goal = def.goalKey ? goals[def.goalKey] : null
  const Icon = def.icon

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <button
          onClick={onBack}
          className="-ml-1.5 mb-2 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] font-medium text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink"
        >
          <ArrowLeft size={13} weight="bold" />
          Back
        </button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="grid h-11 w-11 place-items-center rounded-2xl"
              style={{ background: `color-mix(in oklab, ${def.color} 14%, transparent)` }}
            >
              <Icon size={22} weight="fill" style={{ color: def.color }} />
            </div>
            <div>
              <h1 className="display text-[27px] font-bold leading-tight text-ink">{def.label}</h1>
              {def.hint && <p className="text-[13px] text-ink-dim">{def.hint}</p>}
            </div>
          </div>
          <RangeTabs range={range} onChange={onRangeChange} />
        </div>
      </motion.header>

      {series.isPending ? (
        <MetricDetailSkeleton metricKey={metricKey} range={range} hasGoal={goal != null} />
      ) : range === 'D' ? (
        <DayDetail
          metricKey={metricKey}
          date={date}
          points={contextPoints}
          goal={goal}
          intradayData={wantsIntraday ? intraday.data : undefined}
          intradayPending={wantsIntraday && intraday.isPending}
          activityIntradayData={wantsActivityIntraday ? activityIntraday.data : undefined}
          activityIntradayPending={wantsActivityIntraday && activityIntraday.isPending}
          activityIntradayError={wantsActivityIntraday && activityIntraday.isError}
          heartDetailData={wantsHeartDetail ? heartDetail.data : undefined}
          heartDetailPending={wantsHeartDetail && heartDetail.isPending}
          heartDetailError={wantsHeartDetail && heartDetail.isError}
          onSelectDate={onSelectDate}
        />
      ) : (
        <PeriodDetail
          metricKey={metricKey}
          range={range}
          date={date}
          points={points}
          prevPoints={prevPoints}
          goal={goal}
          onSelectDate={onSelectDate}
        />
      )}
    </div>
  )
}

function MetricDetailSkeleton({
  metricKey,
  range,
  hasGoal
}: {
  metricKey: MetricKey
  range: MetricRange
  hasGoal: boolean
}): React.JSX.Element {
  if (range === 'D') {
    const hasTimeline =
      metricKey === 'steps' ||
      metricKey === 'restingHeartRate' ||
      isActivityIntradayMetric(metricKey)
    const breakdownCount = metricKey === 'caloriesOut' ? 2 : ['activeMinutes', 'activeZoneMinutes'].includes(metricKey) ? 3 : 0
    return (
      <>
        <Panel className={`flex flex-wrap items-center justify-between gap-6 p-6 ${CARD_HEIGHT.summary}`}>
          <div className="flex flex-col gap-3" aria-hidden>
            <SkeletonText className="w-28" />
            <SkeletonBlock className="h-9 w-32" />
            <SkeletonText className="w-40" />
          </div>
          {hasGoal && <SkeletonRing size={108} stroke={10} />}
        </Panel>
        {!SUMMARY_ONLY_DAILY_METRICS.has(metricKey) && (
        <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detail}`}>
          <SectionHeader
            title={hasTimeline ? 'Across the day' : 'In context'}
            hint={hasTimeline ? 'Loading intraday data' : 'The last 14 days, this day highlighted'}
          />
          <SkeletonChart height={breakdownCount > 0 ? 170 : 210} columns={hasTimeline ? 16 : 12} />
          {breakdownCount > 0 && (
            <div
              className="grid gap-4 border-t border-hairline pt-3"
              style={{ gridTemplateColumns: `repeat(${breakdownCount}, minmax(0, 1fr))` }}
              aria-hidden
            >
              {Array.from({ length: breakdownCount }, (_, index) => (
                <div key={index} className="flex flex-col gap-2">
                  <SkeletonText className="w-16" />
                  <SkeletonText className="h-4 w-14" />
                </div>
              ))}
            </div>
          )}
        </Panel>
        )}
      </>
    )
  }

  return (
    <>
      <Panel className={`grid grid-cols-2 divide-x divide-hairline overflow-hidden sm:grid-cols-4 ${CARD_HEIGHT.periodStats}`}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 px-5 py-4" aria-hidden>
            <SkeletonText className="w-16" />
            <SkeletonBlock className="h-5 w-20" />
          </div>
        ))}
      </Panel>
      <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detailLarge}`}>
        <SectionHeader title="Loading period" />
        <SkeletonChart height={240} columns={range === 'Y' ? 12 : 7} />
      </Panel>
    </>
  )
}

function shiftBack(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10)
}

function axisLabelFor(metricKey: MetricKey, unit: string): string {
  if (metricKey === 'sleepMinutes' || metricKey === 'sedentaryMinutes') return 'min'
  if (metricKey === 'steps') return 'steps'
  if (metricKey === 'floors') return 'floors'
  return unit
}

function axisDomainFor(metricKey: MetricKey): { max: number } | undefined {
  return metricKey === 'sleepEfficiency' || metricKey === 'spo2Pct' ? { max: 100 } : undefined
}

function RangeTabs({
  range,
  onChange
}: {
  range: MetricRange
  onChange: (r: MetricRange) => void
}): React.JSX.Element {
  return (
    <div className="flex rounded-xl border border-hairline bg-white/[0.03] p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={cn(
            'relative rounded-[10px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
            range === r.id ? 'text-ink' : 'text-ink-dim hover:text-ink'
          )}
        >
          {range === r.id && (
            <motion.span
              layoutId="range-active"
              className="absolute inset-0 rounded-[10px] border border-hairline bg-white/[0.08]"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            />
          )}
          <span className="relative z-10">{r.label}</span>
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// D — the selected day against your own recent history

function DayDetail({
  metricKey,
  date,
  points,
  goal,
  intradayData,
  intradayPending,
  activityIntradayData,
  activityIntradayPending,
  activityIntradayError,
  heartDetailData,
  heartDetailPending,
  heartDetailError,
  onSelectDate
}: {
  metricKey: MetricKey
  date: string
  points: SeriesPoint[]
  goal: number | null
  intradayData?: ReturnType<typeof useIntraday>['data']
  intradayPending: boolean
  activityIntradayData?: ActivityIntradayResult
  activityIntradayPending: boolean
  activityIntradayError: boolean
  heartDetailData?: HeartDetailResult
  heartDetailPending: boolean
  heartDetailError: boolean
  onSelectDate: (date: string) => void
}): React.JSX.Element {
  const def = METRICS[metricKey]
  const value = points.find((p) => p.date === date)?.value ?? null
  const base = baseline(points, date)
  const emphasis = points.findIndex((p) => p.date === date)
  const axisLabel = axisLabelFor(metricKey, def.unit)

  return (
    <>
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className={`flex flex-wrap items-center justify-between gap-6 p-6 ${CARD_HEIGHT.summary}`}>
          <div>
            <p className="text-[12px] font-medium text-ink-faint">{longDate(date)}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[40px] font-semibold leading-none tracking-tight text-ink">
                {value != null ? def.format(value) : '—'}
              </span>
              {def.unit && <span className="text-[14px] text-ink-dim">{def.unit}</span>}
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-faint">
              {def.deltaMode === 'abs' ? (
                <span>vs your device baseline</span>
              ) : (
                <>
                  <DeltaChip delta={baselineDeltaPct(value, base)} upIsGood={def.upIsGood} />
                  <span>vs 7-day baseline{base != null ? ` (${def.format(base)})` : ''}</span>
                </>
              )}
            </div>
          </div>
          {goal != null && (
            <ProgressRing value={value ?? 0} goal={goal} color={def.color} size={108} stroke={10}>
              <div className="text-center">
                <div className="text-[17px] font-semibold leading-none text-ink">
                  {value != null && goal > 0 ? `${Math.round((value / goal) * 100)}%` : '—'}
                </div>
                <div className="mt-1 text-[9.5px] uppercase tracking-wide text-ink-faint">of goal</div>
              </div>
            </ProgressRing>
          )}
        </Panel>
      </motion.div>

      {!SUMMARY_ONLY_DAILY_METRICS.has(metricKey) && (
      <motion.div custom={2} variants={fade} initial="hidden" animate="show">
        {metricKey === 'steps' && intradayPending ? (
          <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detail}`}>
            <SectionHeader title="Across the day" hint="Steps per hour" />
            <SkeletonChart height={210} columns={12} />
          </Panel>
        ) : metricKey === 'steps' && intradayData && intradayData.stepsHourly.length > 0 ? (
          <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detail}`}>
            <SectionHeader title="Across the day" hint="Steps per hour" />
            <ColumnChart
              data={intradayData.stepsHourly.map((h) => ({
                key: String(h.hour),
                label: formatHour(h.hour),
                value: h.steps,
                tick: h.hour % 6 === 0 ? formatHour(h.hour) : undefined
              }))}
              color={def.color}
              height={210}
              format={formatInt}
              unitLabel="steps"
            />
          </Panel>
        ) : metricKey === 'restingHeartRate' && intradayPending ? (
          <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detail}`}>
            <SectionHeader title="Across the day" hint="Heart rate samples" />
            <SkeletonChart height={210} columns={12} />
          </Panel>
        ) : metricKey === 'restingHeartRate' && intradayData && intradayData.heartRate.length > 1 ? (
          <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detail}`}>
            <SectionHeader
              title="Across the day"
              hint="Heart rate samples"
              action={
                intradayData.currentHeartRate != null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[20px] font-semibold text-ink">{intradayData.currentHeartRate}</span>
                    <span className="text-[12px] text-ink-dim">bpm now</span>
                  </div>
                ) : undefined
              }
            />
            <IntradayLine points={intradayData.heartRate} color={def.color} height={210} />
          </Panel>
        ) : isActivityIntradayMetric(metricKey) ? (
          <ActivityIntradayPanel
            metricKey={metricKey}
            data={activityIntradayData}
            pending={activityIntradayPending}
            error={activityIntradayError}
          />
        ) : (
          <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detail}`}>
            <SectionHeader title="In context" hint="The last 14 days, this day highlighted" />
            {def.chart === 'bar' ? (
              <ColumnChart
                data={points.map((p) => ({
                  key: p.date,
                  label: `${weekdayShort(p.date)} · ${shortDate(p.date)}`,
                  value: p.value,
                  tick: weekdayShort(p.date).slice(0, 1)
                }))}
                color={def.color}
                height={210}
                goal={goal != null ? { value: goal, label: 'goal' } : null}
                emphasisIndex={emphasis}
                format={def.format}
                unitLabel={def.unit}
                axisLabel={axisLabel}
                onSelect={(point) => onSelectDate(point.key)}
              />
            ) : (
              <TrendLine
                data={points.map((p) => ({
                  date: p.date,
                  label: `${weekdayShort(p.date)} · ${shortDate(p.date)}`,
                  value: p.value
                }))}
                color={def.color}
                height={210}
                format={def.format}
                unitLabel={def.unit}
                axisLabel={axisLabel}
                domain={axisDomainFor(metricKey)}
                onSelect={(point) => onSelectDate(point.date)}
              />
            )}
          </Panel>
        )}
      </motion.div>
      )}

      {metricKey === 'restingHeartRate' && (
        <HeartZonesPanel data={heartDetailData} pending={heartDetailPending} error={heartDetailError} />
      )}

      <HistoryList metricKey={metricKey} rows={[...points].reverse()} selected={date} onSelectDate={onSelectDate} />
    </>
  )
}

const BREAKDOWN_LABELS: Record<ActivityIntradayResult['breakdown'][number]['key'], string> = {
  light: 'Light',
  moderate: 'Moderate',
  vigorous: 'Vigorous',
  fatBurn: 'Fat burn',
  cardio: 'Cardio',
  peak: 'Peak',
  activeEnergy: 'Active energy',
  basalEnergy: 'Basal energy'
}

function ActivityIntradayPanel({
  metricKey,
  data,
  pending,
  error
}: {
  metricKey: ActivityIntradayMetric
  data?: ActivityIntradayResult
  pending: boolean
  error: boolean
}): React.JSX.Element {
  const def = METRICS[metricKey]
  const recorded = data?.points.some((point) => point.value != null) ?? false
  const intervalLabel = `${data?.windowMinutes ?? 30}-minute windows`

  return (
    <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detail}`}>
      <SectionHeader title="Across the day" hint={intervalLabel} />
      {pending ? (
        <SkeletonChart height={210} columns={16} />
      ) : error ? (
        <div className="grid h-[190px] place-items-center text-[13px] text-ink-faint">
          Intraday data could not be loaded for this metric.
        </div>
      ) : recorded && data ? (
        <>
          <ColumnChart
            data={data.points.map((point, index) => ({
              key: `${point.minute}-${index}`,
              label: formatMinuteOfDay(point.minute),
              value: point.value,
              tick: point.minute % 180 === 0 ? formatMinuteOfDay(point.minute) : undefined
            }))}
            color={def.color}
            height={data.breakdown.length > 0 ? 170 : 210}
            format={def.format}
            unitLabel={def.unit}
            axisLabel={axisLabelFor(metricKey, def.unit)}
          />
          {data.breakdown.length > 0 && (
            <div
              className="grid divide-x divide-hairline border-t border-hairline pt-3"
              style={{ gridTemplateColumns: `repeat(${data.breakdown.length}, minmax(0, 1fr))` }}
            >
              {data.breakdown.map((item) => (
                <div key={item.key} className="px-4 first:pl-0 last:pr-0">
                  <div className="text-[10.5px] font-medium text-ink-faint">{BREAKDOWN_LABELS[item.key]}</div>
                  <div className="mt-0.5 font-mono text-[15px] font-medium text-ink">
                    {formatInt(item.value)} <span className="text-[10.5px] text-ink-dim">{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="grid h-[190px] place-items-center text-[13px] text-ink-faint">
          No intraday {def.label.toLowerCase()} recorded for this day.
        </div>
      )}
    </Panel>
  )
}

const ZONE_LABELS: Record<HeartDetailResult['zones'][number]['zone'], string> = {
  light: 'Light',
  moderate: 'Moderate',
  vigorous: 'Vigorous',
  peak: 'Peak'
}

function HeartZonesPanel({
  data,
  pending,
  error
}: {
  data?: HeartDetailResult
  pending: boolean
  error: boolean
}): React.JSX.Element | null {
  if (!pending && !error && !data) return null
  return (
    <motion.div custom={3} variants={fade} initial="hidden" animate="show">
      <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.summary}`}>
        <SectionHeader title="Heart-rate zones" hint="Thresholds, time and energy by zone" />
        {pending ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-hidden>
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2 border-l border-hairline px-4 first:border-l-0 first:pl-0">
                <SkeletonText className="w-16" />
                <SkeletonText className="h-4 w-20" />
                <SkeletonText className="w-24" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center text-[13px] text-ink-faint">Heart-rate zones could not be loaded.</div>
        ) : data?.zones.some(
            (zone) => zone.minBpm != null || zone.maxBpm != null || zone.durationMin != null || zone.calories != null
          ) ? (
          <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4">
            {data.zones.map((zone, index) => (
              <div
                key={zone.zone}
                className="border-l border-hairline px-4 first:border-l-0 first:pl-0 max-md:[&:nth-child(odd)]:border-l-0 max-md:[&:nth-child(odd)]:pl-0"
              >
                <div className="flex items-center gap-2 text-[11px] font-medium text-ink-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-heart)]" style={{ opacity: 0.4 + index * 0.18 }} />
                  {ZONE_LABELS[zone.zone]}
                </div>
                <div className="mt-1 font-mono text-[14px] font-medium text-ink">
                  {zone.minBpm != null && zone.maxBpm != null ? `${zone.minBpm}–${zone.maxBpm}` : '—'}{' '}
                  <span className="text-[10px] text-ink-dim">bpm</span>
                </div>
                <div className="mt-1 text-[10.5px] text-ink-dim">
                  {zone.durationMin != null ? `${formatInt(zone.durationMin)} min` : 'No time'}
                  {zone.calories != null && ` · ${formatInt(zone.calories)} kcal`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-[13px] text-ink-faint">No heart-rate zone detail for this day.</div>
        )}
      </Panel>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// W / M / 3M / Y — period stats, chart, history

function PeriodDetail({
  metricKey,
  range,
  date,
  points,
  prevPoints,
  goal,
  onSelectDate
}: {
  metricKey: MetricKey
  range: MetricRange
  date: string
  points: SeriesPoint[]
  prevPoints: SeriesPoint[]
  goal: number | null
  onSelectDate: (date: string) => void
}): React.JSX.Element {
  const def = METRICS[metricKey]
  const axisLabel = axisLabelFor(metricKey, def.unit)
  const present = points.filter((p) => p.value != null).map((p) => p.value as number)

  const current = aggregatePoints(points, def.aggregate)
  const previous = range === 'Y' ? null : aggregatePoints(prevPoints, def.aggregate)
  const deltaVsPrev =
    current != null && previous != null && previous !== 0 ? ((current - previous) / previous) * 100 : null

  const monthlyHistory = range === 'Y' ? monthlyBuckets(points, def.aggregate) : null
  const weeklyBuckets = range === 'Y' && def.chart === 'bar' ? weeklyAverageBuckets(points) : null
  const chartPoints = weeklyBuckets ?? points

  const stats: Array<{ label: string; value: string }> =
    def.aggregate === 'sum'
      ? [
          { label: 'Total', value: current != null ? def.format(current) : '—' },
          {
            label: 'Daily average',
            value: present.length ? def.format(present.reduce((s, v) => s + v, 0) / present.length) : '—'
          },
          { label: 'Best day', value: present.length ? def.format(Math.max(...present)) : '—' }
        ]
      : [
          {
            label: def.aggregate === 'last' ? 'Latest' : 'Average',
            value: current != null ? def.format(current) : '—'
          },
          { label: 'Lowest', value: present.length ? def.format(Math.min(...present)) : '—' },
          { label: 'Highest', value: present.length ? def.format(Math.max(...present)) : '—' }
        ]

  return (
    <>
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className={`grid grid-cols-2 divide-x divide-hairline overflow-hidden sm:grid-cols-4 ${CARD_HEIGHT.periodStats}`}>
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1.5 px-5 py-4">
              <span className="text-[11px] font-medium tracking-wide text-ink-faint">{s.label}</span>
              <span className="text-[22px] font-semibold leading-none tracking-tight text-ink">{s.value}</span>
            </div>
          ))}
          <div className="flex flex-col gap-1.5 px-5 py-4">
            <span className="text-[11px] font-medium tracking-wide text-ink-faint">
              vs previous {range === 'W' ? 'week' : range === 'M' ? 'month' : range === '3M' ? '3 months' : 'period'}
            </span>
            {range === 'Y' ? (
              <span className="text-[13px] text-ink-faint">—</span>
            ) : (
              <div className="flex items-center gap-1.5">
                <DeltaChip delta={deltaVsPrev} upIsGood={def.upIsGood} className="text-[12px]" />
                {deltaVsPrev == null && <span className="text-[13px] text-ink-faint">not enough data</span>}
              </div>
            )}
          </div>
        </Panel>
      </motion.div>

      <motion.div custom={2} variants={fade} initial="hidden" animate="show">
        <Panel className={`flex flex-col gap-3 p-5 ${CARD_HEIGHT.detailLarge}`}>
          <SectionHeader
            title={rangeTitle(range, date)}
            hint={range === 'Y' ? (def.chart === 'bar' ? 'Weekly daily averages' : 'Daily values') : undefined}
          />
          {def.chart === 'bar' ? (
            <ColumnChart
              data={chartPoints.map((p, i) => ({
                key: p.date,
                label: weeklyBuckets
                  ? weekLabel(weeklyBuckets[i])
                  : `${weekdayShort(p.date)} · ${shortDate(p.date)}`,
                value: p.value,
                tick: weeklyBuckets
                  ? weekMonthTick(weeklyBuckets, i)
                  : tickFor(range, p.date, i)
              }))}
              color={def.color}
              height={240}
              goal={goal != null ? { value: goal, label: 'goal' } : null}
              emphasisIndex={weeklyBuckets ? undefined : chartPoints.findIndex((p) => p.date === date)}
              format={def.format}
              unitLabel={def.unit}
              axisLabel={axisLabel}
              onSelect={weeklyBuckets ? undefined : (point) => onSelectDate(point.key)}
            />
          ) : (
            <TrendLine
              data={chartPoints.map((p, index) => ({
                date: p.date,
                label: `${weekdayShort(p.date)} · ${shortDate(p.date)}`,
                value: p.value,
                tick: range === 'Y' ? dailyMonthTick(chartPoints, index) : undefined
              }))}
              color={def.color}
              height={240}
              format={def.format}
              unitLabel={def.unit}
              axisLabel={axisLabel}
              domain={axisDomainFor(metricKey)}
              onSelect={(point) => onSelectDate(point.date)}
            />
          )}
        </Panel>
      </motion.div>

      <HistoryList
        metricKey={metricKey}
        rows={[...(monthlyHistory ?? points)].reverse().slice(0, 31)}
        selected={date}
        monthly={monthlyHistory != null}
        onSelectDate={monthlyHistory == null ? onSelectDate : undefined}
      />
    </>
  )
}

function rangeTitle(range: MetricRange, date: string): string {
  if (range === 'W') return 'Last 7 days'
  if (range === 'M') return 'Last 30 days'
  if (range === '3M') return 'Last 3 months'
  return `Year to ${shortDate(date)}`
}

function tickFor(range: MetricRange, date: string, index: number): string | undefined {
  if (range === 'W') return weekdayShort(date).slice(0, 1)
  if (range === 'M') return index % 5 === 0 ? date.slice(8) : undefined
  if (range === '3M') return date.slice(8, 10) === '01' ? monthLabel(date) : undefined
  return monthLabel(date).slice(0, 1)
}

function dailyMonthTick(points: SeriesPoint[], index: number): string | undefined {
  const point = points[index]
  const previous = points[index - 1]
  return index === 0 || point.date.slice(0, 7) !== previous.date.slice(0, 7) ? monthLabel(point.date) : undefined
}

function weekMonthTick(points: WeeklySeriesPoint[], index: number): string | undefined {
  const point = points[index]
  const previous = points[index - 1]
  return index === 0 || point.midpointDate.slice(0, 7) !== previous.midpointDate.slice(0, 7)
    ? monthLabel(point.midpointDate)
    : undefined
}

function weekLabel(point: WeeklySeriesPoint): string {
  return `${shortDate(point.date)}–${shortDate(point.endDate)}`
}

function monthLabel(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 7)}-15T12:00:00`).toLocaleDateString('en-US', { month: 'short' })
}

function HistoryList({
  metricKey,
  rows,
  selected,
  monthly = false,
  onSelectDate
}: {
  metricKey: MetricKey
  rows: SeriesPoint[]
  selected: string
  monthly?: boolean
  onSelectDate?: (date: string) => void
}): React.JSX.Element | null {
  const def = METRICS[metricKey]
  const withValues = rows.filter((r) => r.value != null)
  if (withValues.length === 0) return null
  return (
    <motion.div custom={3} variants={fade} initial="hidden" animate="show">
      <Panel className="overflow-hidden">
        <div className="border-b border-hairline px-5 pb-3 pt-4">
          <SectionHeader title="History" hint={monthly ? 'By month' : 'Most recent first'} />
        </div>
        <div className="divide-y divide-hairline">
          {withValues.map((row) => {
            const rowClassName = cn(
              'flex w-full items-center justify-between px-5 py-2.5 text-left',
              onSelectDate && 'transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50',
              row.date === selected && 'bg-white/[0.03]'
            )
            const content = (
              <>
                <span className="text-[12.5px] text-ink-dim">
                  {monthly
                    ? new Date(`${row.date.slice(0, 7)}-15T12:00:00`).toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric'
                      })
                    : `${weekdayShort(row.date)} · ${shortDate(row.date)}`}
                </span>
                <span className="font-mono text-[13px] text-ink">
                  {def.format(row.value as number)}
                  {def.unit && <span className="ml-1 text-[10.5px] text-ink-faint">{def.unit}</span>}
                </span>
              </>
            )

            return onSelectDate ? (
              <button type="button" key={row.date} onClick={() => onSelectDate(row.date)} className={rowClassName}>
                {content}
              </button>
            ) : (
              <div key={row.date} className={rowClassName}>{content}</div>
            )
          })}
        </div>
      </Panel>
    </motion.div>
  )
}

import { motion } from 'framer-motion'
import { ForkKnife } from '@phosphor-icons/react'
import { Panel, DrillHeader, SectionHeader } from '@/components/Panel'
import { ColumnChart } from '@/components/charts'
import { DeltaChip } from '@/components/DeltaChip'
import { CARD_HEIGHT, SkeletonBlock, SkeletonChart, SkeletonText } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useSeries } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { metricAbsent, rangeEnding, seriesPoints } from '@/lib/metrics'
import { formatInt, longDate, weekdayShort } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { DayValues, MetricKey } from '@shared/types'

const NUTRITION_METRICS: MetricKey[] = [
  'caloriesIn',
  'caloriesOut',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'waterMl'
]

// Macro energy densities, kcal per gram.
const MACROS = [
  { key: 'proteinG' as const, label: 'Protein', kcalPerG: 4, color: 'var(--color-recovery)' },
  { key: 'carbsG' as const, label: 'Carbs', kcalPerG: 4, color: 'var(--color-activity)' },
  { key: 'fatG' as const, label: 'Fat', kcalPerG: 9, color: 'var(--color-heart)' }
]

interface NutritionViewProps {
  date: string
  onOpenMetric: (metric: MetricKey) => void
}

export function NutritionView({ date, onOpenMetric }: NutritionViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 7)
  const series = useSeries(NUTRITION_METRICS, start, end)

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const today: DayValues = days?.[date] ?? {}
  const pointsFor = (key: MetricKey) => seriesPoints(days, key, start, end)

  const intakePending = series.isMetricPending('caloriesIn')
  const anyIntake = intakePending || (series.data ? !metricAbsent(pointsFor('caloriesIn')) : true)
  const hasMacrosToday = MACROS.some((m) => today[m.key] != null)
  const macrosPending = MACROS.some((macro) => series.isMetricPending(macro.key))
  const net =
    today.caloriesIn != null && today.caloriesOut != null ? today.caloriesIn - today.caloriesOut : null

  const barCard = (key: MetricKey, index: number): React.JSX.Element => {
    const def = METRICS[key]
    const points = pointsFor(key)
    const pending = series.isMetricPending(key)
    return (
      <motion.div key={key} custom={index} variants={fade} initial="hidden" animate="show">
        <Panel className={`flex h-full flex-col gap-4 p-6 ${CARD_HEIGHT.chart}`}>
          <DrillHeader
            title={def.label}
            hint="Last 7 days"
            icon={<def.icon size={18} weight="fill" style={{ color: def.color }} />}
            action={
              pending ? (
                <SkeletonText className="h-5 w-20" />
              ) : today[key] != null ? (
                <span className="text-[20px] font-semibold text-ink">
                  {def.format(today[key] as number)}{' '}
                  <span className="text-[12px] font-normal text-ink-dim">{def.unit}</span>
                </span>
              ) : undefined
            }
            onOpen={() => onOpenMetric(key)}
          />
          <div className="mt-auto">
            {pending ? (
              <SkeletonChart />
            ) : (
              <ColumnChart
                data={points.map((p) => ({
                  key: p.date,
                  label: `${weekdayShort(p.date)} · ${p.date.slice(5)}`,
                  value: p.value,
                  tick: weekdayShort(p.date).slice(0, 1)
                }))}
                color={def.color}
                emphasisIndex={6}
                format={def.format}
                unitLabel={def.unit}
              />
            )}
          </div>
        </Panel>
      </motion.div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Nutrition</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(date)} · logged food and water</p>
      </motion.header>

      {!anyIntake ? (
        <Panel className="grid place-items-center p-12 text-center text-[13px] leading-relaxed text-ink-faint">
          No food logged in this window. Meals logged in the Fitbit app — calories and macros — appear here.
        </Panel>
      ) : (
        <>
          {/* Today: energy + macro split */}
          <motion.div custom={1} variants={fade} initial="hidden" animate="show">
            <Panel className={`grid grid-cols-1 gap-6 p-6 lg:grid-cols-[auto_1fr] ${CARD_HEIGHT.hero}`}>
              <div className="flex min-w-[220px] flex-col justify-center gap-2">
                <SectionHeader
                  title="Energy"
                  hint="Logged intake vs burned"
                  icon={<ForkKnife size={18} weight="fill" style={{ color: 'var(--color-activity)' }} />}
                />
                <div className="mt-2 flex items-baseline gap-2">
                  {intakePending ? (
                    <SkeletonText className="h-8 w-24" />
                  ) : (
                    <span className="text-[34px] font-semibold leading-none tracking-tight text-ink">
                      {today.caloriesIn != null ? formatInt(today.caloriesIn) : '—'}
                    </span>
                  )}
                  <span className="text-[13px] text-ink-dim">kcal eaten</span>
                </div>
                {series.isMetricPending('caloriesOut') ? (
                  <SkeletonText className="mt-1 w-36" />
                ) : today.caloriesOut != null ? (
                  <div className="flex items-center gap-2 text-[12.5px] text-ink-dim">
                    {formatInt(today.caloriesOut)} kcal burned
                    {net != null && (
                      <DeltaChip
                        delta={net}
                        upIsGood={null}
                        format={(m) => `${net > 0 ? '+' : '−'}${formatInt(m)} net`}
                        minMagnitude={0}
                      />
                    )}
                  </div>
                ) : null}
              </div>

              <div className="lg:border-l lg:border-hairline lg:pl-6">
                {macrosPending ? (
                  <MacroBreakdownSkeleton />
                ) : hasMacrosToday ? (
                  <MacroBreakdown today={today} onOpenMetric={onOpenMetric} />
                ) : (
                  <div className="grid h-full min-h-[120px] place-items-center text-[13px] text-ink-faint">
                    No macro detail for this day — log meals in the Fitbit app to break energy into protein, carbs, and fat.
                  </div>
                )}
              </div>
            </Panel>
          </motion.div>

          {/* Trends */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {barCard('caloriesIn', 2)}
            {barCard('waterMl', 3)}
          </div>
        </>
      )}
    </div>
  )
}

function MacroBreakdownSkeleton(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col justify-center gap-4" aria-hidden>
      <SkeletonBlock className="h-3 w-full rounded-full" />
      <div className="grid grid-cols-3 gap-3">
        {MACROS.map((macro) => (
          <div key={macro.key} className="flex flex-col gap-2 px-2 py-1.5">
            <SkeletonText className="w-14" />
            <SkeletonBlock className="h-4 w-12" />
            <SkeletonText className="w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

function MacroBreakdown({
  today,
  onOpenMetric
}: {
  today: DayValues
  onOpenMetric: (metric: MetricKey) => void
}): React.JSX.Element {
  const parts = MACROS.map((m) => ({ ...m, grams: today[m.key] ?? null, kcal: (today[m.key] ?? 0) * m.kcalPerG }))
  const totalKcal = parts.reduce((s, p) => s + p.kcal, 0) || 1

  return (
    <div className="flex h-full flex-col justify-center gap-4">
      {/* Stacked share bar */}
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
        {parts.map(
          (p) =>
            p.kcal > 0 && (
              <div key={p.key} style={{ width: `${(p.kcal / totalKcal) * 100}%`, background: p.color }} />
            )
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {parts.map((p) => (
          <button
            key={p.key}
            onClick={() => onOpenMetric(p.key)}
            className="rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="text-[11px] font-medium text-ink-faint">{p.label}</span>
            </div>
            <div className="mt-1 text-[17px] font-semibold text-ink">
              {p.grams != null ? `${formatInt(p.grams)} g` : '—'}
            </div>
            <div className="text-[10.5px] text-ink-faint">{Math.round((p.kcal / totalKcal) * 100)}% of energy</div>
          </button>
        ))}
      </div>
      {today.fiberG != null && (
        <div className="border-t border-hairline pt-3 text-[12px] text-ink-dim">
          Fiber {formatInt(today.fiberG)} g
        </div>
      )}
    </div>
  )
}

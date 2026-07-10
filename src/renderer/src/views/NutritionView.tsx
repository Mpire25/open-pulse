import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretDown, ForkKnife } from '@phosphor-icons/react'
import { Panel, DrillHeader, InteractivePanel, SectionHeader } from '@/components/Panel'
import { ColumnChart, ProgressRing } from '@/components/charts'
import { DeltaChip } from '@/components/DeltaChip'
import { CARD_HEIGHT, SkeletonBlock, SkeletonChart, SkeletonText } from '@/components/Skeleton'
import { ErrorState } from '@/components/ErrorState'
import { useNutritionLogs, useSeries } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { listDates, metricAbsent, rangeEnding, seriesPoints } from '@/lib/metrics'
import { formatClock, formatInt, longDate, shortDate, weekdayShort } from '@/lib/format'
import type { OpenMetric } from '@/lib/metric-navigation'
import { fade } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { DayValues, Goals, MetricKey, NutritionLogEntry } from '@shared/types'

const NUTRITION_METRICS: MetricKey[] = [
  'caloriesIn',
  'caloriesOut',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'saturatedFatG',
  'sodiumG',
  'sugarG'
]

// Macro energy densities, kcal per gram.
const MACROS = [
  { key: 'proteinG' as const, label: 'Protein', kcalPerG: 4, color: 'var(--color-recovery)' },
  { key: 'carbsG' as const, label: 'Carbs', kcalPerG: 4, color: 'var(--color-activity)' },
  { key: 'fatG' as const, label: 'Fat', kcalPerG: 9, color: 'var(--color-heart)' }
]

const SECONDARY_NUTRIENTS = [
  { key: 'fiberG' as const, label: 'Fiber', unit: 'g', color: 'var(--color-hydration)', decimals: 0 },
  { key: 'saturatedFatG' as const, label: 'Saturated fat', unit: 'g', color: 'var(--color-heart)', decimals: 0 },
  { key: 'sodiumG' as const, label: 'Sodium', unit: 'g', color: 'var(--color-activity)', decimals: 2 },
  { key: 'sugarG' as const, label: 'Sugar', unit: 'g', color: 'var(--color-body-metric)', decimals: 0 }
]

interface NutritionViewProps {
  date: string
  goals: Goals
  onOpenMetric: OpenMetric
  onSelectDate: (date: string) => void
}

export function NutritionView({ date, goals, onOpenMetric, onSelectDate }: NutritionViewProps): React.JSX.Element {
  const { start, end } = rangeEnding(date, 7)
  const series = useSeries(NUTRITION_METRICS, start, end)
  const nutritionLogs = useNutritionLogs(date)

  if (series.isError) {
    return <ErrorState message={series.error instanceof Error ? series.error.message : undefined} onRetry={() => void series.refetch()} />
  }

  const days = series.data?.days
  const today: DayValues = days?.[date] ?? {}
  const pointsFor = (key: MetricKey) => seriesPoints(days, key, start, end)

  const intakePending = series.isMetricPending('caloriesIn')
  const entries = nutritionLogs.data ?? []
  const anyIntake = intakePending
    || nutritionLogs.isPending
    || entries.length > 0
    || (series.data ? !metricAbsent(pointsFor('caloriesIn')) : true)
  const hasMacrosToday = MACROS.some((m) => today[m.key] != null)
  const macrosPending = MACROS.some((macro) => series.isMetricPending(macro.key))
  const recordedDays = listDates(start, end)
    .map((dayDate) => ({ date: dayDate, values: days?.[dayDate] ?? {} }))
    .filter(({ values }) => values.caloriesIn != null || MACROS.some((macro) => values[macro.key] != null))
  const recentDays = [...recordedDays].reverse().filter((day) => day.date !== date)
  const net =
    today.caloriesIn != null && today.caloriesOut != null ? today.caloriesIn - today.caloriesOut : null

  const barCard = (key: MetricKey, index: number): React.JSX.Element => {
    const def = METRICS[key]
    const points = pointsFor(key)
    const pending = series.isMetricPending(key)
    return (
      <motion.div key={key} custom={index} variants={fade} initial="hidden" animate="show">
        <InteractivePanel
          className={`flex h-full flex-col gap-3 p-5 ${CARD_HEIGHT.chart}`}
          onOpen={() => onOpenMetric(key, 'W')}
        >
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
        </InteractivePanel>
      </motion.div>
    )
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Nutrition</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(date)} · logged food</p>
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
                {intakePending ? (
                  <SkeletonText className="mt-1 w-32" />
                ) : (
                  <div className="text-[11px] text-ink-faint">
                    {today.caloriesIn != null
                      ? `${Math.round((today.caloriesIn / goals.caloriesIn) * 100)}% of ${formatInt(goals.caloriesIn)} kcal goal`
                      : `${formatInt(goals.caloriesIn)} kcal goal`}
                  </div>
                )}
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
                  <MacroBreakdown
                    today={today}
                    goals={goals}
                    entries={entries}
                    onOpenMetric={onOpenMetric}
                    isMetricPending={(key) => series.isMetricPending(key) || nutritionLogs.isPending}
                  />
                ) : (
                  <div className="grid h-full min-h-[120px] place-items-center text-[13px] text-ink-faint">
                    No macro detail for this day — log meals in the Fitbit app to break energy into protein, carbs, and fat.
                  </div>
                )}
              </div>
            </Panel>
          </motion.div>

          {(nutritionLogs.isPending || nutritionLogs.isError || entries.length > 0) && (
            <motion.div custom={2} variants={fade} initial="hidden" animate="show">
              {nutritionLogs.isPending ? (
                <NutritionLogsSkeleton />
              ) : nutritionLogs.isError ? (
                <Panel className="px-5 py-4 text-[12px] text-ink-faint">
                  Individual food details could not be loaded.
                </Panel>
              ) : (
                <NutritionLogsPanel entries={entries} />
              )}
            </motion.div>
          )}

          {/* Trends */}
          <div className="grid grid-cols-1 gap-5">
            {barCard('caloriesIn', 3)}
          </div>

          {/* Day-by-day energy and macro mix */}
          {recentDays.length > 0 && (
            <motion.div custom={4} variants={fade} initial="hidden" animate="show">
              <h2 className="mb-3 px-1 text-[13px] font-semibold text-ink-dim">Recent days</h2>
              <div className="flex flex-col gap-2.5">
                {recentDays.map((day) => (
                  <NutritionDayRow
                    key={day.date}
                    date={day.date}
                    values={day.values}
                    onSelect={onSelectDate}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}

function NutritionDayRow({
  date,
  values,
  onSelect
}: {
  date: string
  values: DayValues
  onSelect: (date: string) => void
}): React.JSX.Element {
  const parts = MACROS.map((macro) => {
    const grams = values[macro.key] ?? null
    return { ...macro, grams, kcal: (grams ?? 0) * macro.kcalPerG }
  })
  const macroCalories = parts.reduce((sum, part) => sum + part.kcal, 0)

  return (
    <InteractivePanel className="flex items-center gap-4 px-5 py-3.5" onOpen={() => onSelect(date)}>
      <div className="w-28 shrink-0">
        <div className="text-[13px] font-medium text-ink">
          {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <div className="text-[11px] text-ink-faint">{shortDate(date)}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-white/[0.04]"
          role="img"
          aria-label={parts
            .filter((part) => part.grams != null)
            .map((part) => `${part.label} ${formatInt(part.grams!)} grams`)
            .join(', ') || 'No macro details'}
        >
          {macroCalories > 0 && parts.map((part) => part.kcal > 0 ? (
            <span
              key={part.key}
              className="rounded-full"
              style={{ width: `${(part.kcal / macroCalories) * 100}%`, background: part.color }}
            />
          ) : null)}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {parts.map((part) => (
            <MacroTotal key={part.key} label={part.label} value={part.grams} color={part.color} />
          ))}
        </div>
      </div>
      <div className="w-24 shrink-0 text-right">
        <span className="font-mono text-[13px] text-ink">
          {values.caloriesIn != null ? formatInt(values.caloriesIn) : '—'}
        </span>{' '}
        <span className="text-[9.5px] text-ink-dim">kcal</span>
      </div>
    </InteractivePanel>
  )
}

const MEAL_ORDER = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Other'] as const
type MealGroup = (typeof MEAL_ORDER)[number]

function mealGroup(mealType: string | null): MealGroup {
  if (mealType === 'BREAKFAST') return 'Breakfast'
  if (mealType === 'LUNCH') return 'Lunch'
  if (mealType === 'DINNER') return 'Dinner'
  if (mealType === 'SNACK' || mealType?.startsWith('BEFORE_') || mealType === 'AFTER_DINNER') return 'Snack'
  return 'Other'
}

function NutritionLogsPanel({ entries }: { entries: NutritionLogEntry[] }): React.JSX.Element {
  const groups = MEAL_ORDER.map((label) => ({
    label,
    entries: entries.filter((entry) => mealGroup(entry.mealType) === label)
  })).filter((group) => group.entries.length > 0)

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-hairline px-5 pb-3 pt-4">
        <SectionHeader
          title="Logged meals"
          hint={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} organized by meal`}
          icon={<ForkKnife size={18} weight="fill" style={{ color: 'var(--color-activity)' }} />}
        />
      </div>
      <div className="divide-y divide-hairline">
        {groups.map((group) => (
          <MealGroupSection key={group.label} label={group.label} entries={group.entries} />
        ))}
      </div>
    </Panel>
  )
}

const MEAL_REVEAL_EASE = [0.16, 1, 0.3, 1] as const

function MealGroupSection({ label, entries }: { label: MealGroup; entries: NutritionLogEntry[] }): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const contentId = `meal-${label.toLowerCase()}-items`

  return (
    <section>
      <MealSummary
        label={label}
        entries={entries}
        isOpen={isOpen}
        contentId={contentId}
        onToggle={() => setIsOpen((open) => !open)}
      />
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={contentId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.36, ease: MEAL_REVEAL_EASE }, opacity: { duration: 0.22 } }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-hairline border-t border-hairline bg-white/[0.012]">
              {entries.map((entry, index) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 + index * 0.045, duration: 0.32, ease: MEAL_REVEAL_EASE }}
                >
                  <NutritionItemRow entry={entry} />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function NutritionItemRow({ entry }: { entry: NutritionLogEntry }): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <div className="truncate text-[12.5px] font-medium text-ink">{entry.foodName}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-ink-faint">
          <span className="font-mono">{formatClock(entry.startTime)}</span>
          {entry.servingLabel && <span>{entry.servingLabel}</span>}
        </div>
        <MacroShareBar entries={[entry]} className="mt-2 max-w-[230px]" compact />
      </div>
      <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-1 whitespace-nowrap sm:justify-end sm:text-right">
        <div className="flex items-center gap-3">
          <MacroTotal label="Protein" value={entry.proteinG} color="var(--color-recovery)" />
          <MacroTotal label="Carbs" value={entry.carbsG} color="var(--color-activity)" />
          <MacroTotal label="Fat" value={entry.fatG} color="var(--color-heart)" />
        </div>
        <div>
          <span className="font-mono text-[13px] font-medium text-ink">
            {entry.calories != null ? formatInt(entry.calories) : '—'}
          </span>{' '}
          <span className="text-[9.5px] text-ink-dim">kcal</span>
        </div>
      </div>
    </div>
  )
}

function sumValue(
  entries: NutritionLogEntry[],
  key: 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'saturatedFatG' | 'sodiumG' | 'sugarG'
): number | null {
  const values = entries.flatMap((entry) => entry[key] == null ? [] : [entry[key]])
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null
}

function MealSummary({
  label,
  entries,
  isOpen,
  contentId,
  onToggle
}: {
  label: MealGroup
  entries: NutritionLogEntry[]
  isOpen: boolean
  contentId: string
  onToggle: () => void
}): React.JSX.Element {
  const calories = sumValue(entries, 'calories')
  const protein = sumValue(entries, 'proteinG')
  const carbs = sumValue(entries, 'carbsG')
  const fat = sumValue(entries, 'fatG')
  const fiber = sumValue(entries, 'fiberG')
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={contentId}
      onClick={onToggle}
      className="w-full cursor-pointer px-5 py-4 text-left transition-colors hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 active:bg-white/[0.04]"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <h3 className="text-[14px] font-semibold text-ink">{label}</h3>
          <span className="text-[10.5px] text-ink-faint">
            {entries.length} {entries.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="whitespace-nowrap font-mono text-[12.5px] text-ink-dim">
            {calories != null ? formatInt(calories) : '—'} <span className="text-[9.5px]">kcal</span>
          </div>
          <CaretDown
            size={13}
            weight="bold"
            className={cn('text-ink-faint transition-transform duration-300', isOpen && 'rotate-180')}
          />
        </div>
      </div>
      <MacroShareBar entries={entries} className="mt-3" />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <MacroTotal label="Protein" value={protein} color="var(--color-recovery)" />
        <MacroTotal label="Carbs" value={carbs} color="var(--color-activity)" />
        <MacroTotal label="Fat" value={fat} color="var(--color-heart)" />
        {fiber != null && <MacroTotal label="Fiber" value={fiber} color="var(--color-hydration)" />}
      </div>
    </button>
  )
}

function MacroTotal({ label, value, color }: { label: string; value: number | null; color: string }): React.JSX.Element | null {
  if (value == null) return null
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] text-ink-faint">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label} <span className="font-mono text-ink-dim">{formatInt(value)}g</span>
    </span>
  )
}

function MacroShareBar({
  entries,
  compact = false,
  className
}: {
  entries: NutritionLogEntry[]
  compact?: boolean
  className?: string
}): React.JSX.Element {
  const parts = [
    { label: 'Protein', grams: sumValue(entries, 'proteinG') ?? 0, kcalPerG: 4, color: 'var(--color-recovery)' },
    { label: 'Carbs', grams: sumValue(entries, 'carbsG') ?? 0, kcalPerG: 4, color: 'var(--color-activity)' },
    { label: 'Fat', grams: sumValue(entries, 'fatG') ?? 0, kcalPerG: 9, color: 'var(--color-heart)' }
  ].map((part) => ({ ...part, kcal: part.grams * part.kcalPerG }))
  const total = parts.reduce((sum, part) => sum + part.kcal, 0)
  const ariaLabel = parts.filter((part) => part.grams > 0).map((part) => `${part.label} ${formatInt(part.grams)} grams`).join(', ')
  return (
    <div
      className={cn('flex overflow-hidden rounded-full bg-white/[0.04]', compact ? 'h-1' : 'h-2', className)}
      role="img"
      aria-label={ariaLabel || 'No macro details'}
    >
      {total > 0 && parts.map((part) => part.kcal > 0 ? (
        <span
          key={part.label}
          style={{ width: `${(part.kcal / total) * 100}%`, background: part.color }}
        />
      ) : null)}
    </div>
  )
}

function NutritionLogsSkeleton(): React.JSX.Element {
  return (
    <Panel className="overflow-hidden" aria-hidden>
      <div className="border-b border-hairline px-5 pb-3 pt-4">
        <SkeletonText className="h-4 w-28" />
        <SkeletonText className="mt-2 w-36" />
      </div>
      {Array.from({ length: 2 }, (_, groupIndex) => (
        <div key={groupIndex} className="border-b border-hairline last:border-b-0">
          <div className="px-5 py-4">
            <div className="flex justify-between gap-4">
              <SkeletonText className="h-4 w-24" />
              <SkeletonText className="w-16" />
            </div>
            <SkeletonBlock className="mt-3 h-2 w-full rounded-full" />
            <div className="mt-2 flex gap-4">
              <SkeletonText className="w-20" />
              <SkeletonText className="w-20" />
              <SkeletonText className="w-20" />
            </div>
          </div>
        </div>
      ))}
    </Panel>
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
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-2">
                <SkeletonBlock className="h-4 w-12" />
                <SkeletonText className="w-16" />
              </div>
              <div className="h-12 w-12 shrink-0 animate-pulse rounded-full border-[6px] border-white/[0.055]" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-3 sm:grid-cols-4">
        {SECONDARY_NUTRIENTS.map((nutrient) => (
          <div key={nutrient.key} className="flex flex-col gap-1.5 px-2">
            <SkeletonText className="w-16" />
            <SkeletonBlock className="h-4 w-12" />
          </div>
        ))}
      </div>
    </div>
  )
}

function MacroBreakdown({
  today,
  goals,
  entries,
  onOpenMetric,
  isMetricPending
}: {
  today: DayValues
  goals: Goals
  entries: NutritionLogEntry[]
  onOpenMetric: OpenMetric
  isMetricPending: (key: MetricKey) => boolean
}): React.JSX.Element {
  const parts = MACROS.map((m) => ({ ...m, grams: today[m.key] ?? null, kcal: (today[m.key] ?? 0) * m.kcalPerG }))
  const totalKcal = parts.reduce((s, p) => s + p.kcal, 0) || 1
  const secondary = SECONDARY_NUTRIENTS
    .map((nutrient) => {
      // Individual foods retain sugar, saturated fat, and mixed sodium units
      // that Google's daily rollup can omit or aggregate incorrectly.
      const recorded = sumValue(entries, nutrient.key) ?? today[nutrient.key]
      const pending = (recorded == null || recorded <= 0) && isMetricPending(nutrient.key)
      const value = recorded != null && recorded > 0 ? recorded : null
      return { ...nutrient, value, pending }
    })
    .filter((nutrient) => nutrient.pending || nutrient.value != null)

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
            onClick={() => onOpenMetric(p.key, 'D')}
            className="group min-w-0 rounded-xl px-2 py-1.5 text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="text-[11px] font-medium text-ink-faint">{p.label}</span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <div className="min-w-0">
                <div className="text-[17px] font-semibold text-ink">
                  {p.grams != null ? `${formatInt(p.grams)} g` : '—'}
                </div>
                <div className="truncate text-[10.5px] text-ink-faint">{formatInt(goals[p.key])} g goal</div>
              </div>
              <ProgressRing value={p.grams ?? 0} goal={goals[p.key]} color={p.color} size={48} stroke={6}>
                <span className="font-mono text-[9px] font-medium text-ink">
                  {p.grams != null ? `${Math.round((p.grams / goals[p.key]) * 100)}%` : '—'}
                </span>
              </ProgressRing>
            </div>
          </button>
        ))}
      </div>
      {secondary.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(105px,1fr))] gap-3 border-t border-hairline pt-3">
          {secondary.map((nutrient) => (
            <div key={nutrient.key} className="min-w-0 px-2 py-1">
              <div className="flex items-center gap-1.5 text-[10.5px] font-medium text-ink-faint">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: nutrient.color }} />
                <span className="truncate">{nutrient.label}</span>
              </div>
              {nutrient.pending ? (
                <SkeletonBlock className="mt-1.5 h-4 w-12" />
              ) : (
                <div className="mt-1 font-mono text-[13px] font-medium text-ink">
                  {nutrient.value != null
                    ? nutrient.decimals > 0 && nutrient.value < 0.01
                      ? '<0.01'
                      : nutrient.value.toFixed(nutrient.decimals)
                    : '—'}{' '}
                  <span className="text-[10px] font-normal text-ink-faint">{nutrient.unit}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

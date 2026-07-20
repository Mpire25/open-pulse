import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Barbell,
  CalendarCheck,
  ChartDonut,
  Fire,
  Timer
} from '@phosphor-icons/react'
import { ErrorState } from '@/components/ErrorState'
import { Panel, SectionHeader } from '@/components/Panel'
import { CARD_HEIGHT, SkeletonBlock, SkeletonChart, SkeletonRows, SkeletonText } from '@/components/Skeleton'
import { WorkoutList } from '@/components/WorkoutList'
import { StackedColumnChart, type StackedColumnSegment } from '@/components/charts'
import { useWorkouts } from '@/hooks/useHealth'
import { formatInt, formatMinutes, longDate, shortDate, weekdayShort } from '@/lib/format'
import type { MetricRange } from '@/lib/metric-navigation'
import { listDates, rangeEnding } from '@/lib/metrics'
import { fade } from '@/lib/motion'
import {
  workoutDate,
  workoutDaySummaries,
  workoutTone,
  workoutTypeLabel,
  workoutTypeSummaries,
  type WorkoutTypeSummary
} from '@/lib/workouts'
import { cn } from '@/lib/utils'
import type { Workout } from '@shared/types'

const RANGES: Array<{ id: MetricRange; label: string; days: number }> = [
  { id: 'D', label: 'D', days: 1 },
  { id: 'W', label: 'W', days: 7 },
  { id: 'M', label: 'M', days: 30 },
  { id: '3M', label: '3M', days: 90 },
  { id: 'Y', label: 'Y', days: 365 }
]

interface WorkoutsViewProps {
  date: string
  range: MetricRange
  onBack: () => void
  onRangeChange: (range: MetricRange) => void
  onSelectDate: (date: string) => void
  onOpenWorkout: (workout: Workout) => void
}

export function WorkoutsView({
  date,
  range,
  onBack,
  onRangeChange,
  onSelectDate,
  onOpenWorkout
}: WorkoutsViewProps): React.JSX.Element {
  const spec = RANGES.find((candidate) => candidate.id === range)!
  const shown = rangeEnding(date, spec.days)
  const workouts = useWorkouts(shown.start, shown.end)

  if (workouts.isError) {
    return (
      <ErrorState
        message={workouts.error instanceof Error ? workouts.error.message : undefined}
        onRetry={() => void workouts.refetch()}
      />
    )
  }

  const sessions = workouts.data ?? []
  const days = workoutDaySummaries(sessions, shown.start, shown.end)
  const types = workoutTypeSummaries(sessions)
  const displayedTypes = displayedWorkoutTypes(types)
  const displayedTypeFor = new Map(
    displayedTypes.flatMap((type) => type.sourceLabels.map((label) => [label, type.label] as const))
  )
  const durationByDayAndType = new Map<string, Map<string, number>>()
  for (const workout of sessions) {
    const day = workoutDate(workout)
    const type = displayedTypeFor.get(workoutTypeLabel(workout)) ?? 'Other'
    const durations = durationByDayAndType.get(day) ?? new Map<string, number>()
    durations.set(type, (durations.get(type) ?? 0) + workout.durationMin)
    durationByDayAndType.set(day, durations)
  }
  const totalMinutes = sessions.reduce((sum, workout) => sum + workout.durationMin, 0)
  const measuredCalories = sessions.flatMap((workout) =>
    workout.calories == null ? [] : [workout.calories]
  )
  const totalCalories = measuredCalories.reduce((sum, calories) => sum + calories, 0)
  const calorieSummary =
    sessions.length === 0
      ? '0 kcal'
      : measuredCalories.length === 0
        ? '—'
        : `${formatInt(totalCalories)}${measuredCalories.length < sessions.length ? '+' : ''} kcal`
  const activeDays = new Set(sessions.map(workoutDate)).size
  const groups = [...new Set(sessions.map(workoutDate))]
    .sort((a, b) => b.localeCompare(a))
    .map((groupDate) => ({
      date: groupDate,
      workouts: sessions
        .filter((workout) => workoutDate(workout) === groupDate)
        .sort((a, b) => b.startTime.localeCompare(a.startTime))
    }))

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1.5 mb-2 flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12.5px] font-medium text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <ArrowLeft size={13} weight="bold" />
          Back
        </button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-recovery-soft text-recovery">
              <Barbell size={22} weight="fill" />
            </div>
            <div className="min-w-0">
              <h1 className="display text-[27px] font-bold leading-tight text-ink">Workouts</h1>
              <p className="text-[13px] text-ink-dim">{periodLabel(range, shown.start, shown.end)}</p>
            </div>
          </div>
          <WorkoutRangeTabs range={range} onChange={onRangeChange} />
        </div>
      </motion.header>

      {workouts.isPending ? (
        <WorkoutsSkeleton range={range} />
      ) : (
        <>
          <motion.div custom={1} variants={fade} initial="hidden" animate="show">
            <Panel className={`display-sm-four-grid divide-x divide-hairline overflow-hidden ${CARD_HEIGHT.periodStats}`}>
              <SummaryStat icon={<Barbell size={15} weight="fill" />} label="Sessions" value={formatInt(sessions.length)} />
              <SummaryStat icon={<Timer size={15} weight="fill" />} label="Active time" value={formatMinutes(totalMinutes)} />
              <SummaryStat icon={<Fire size={15} weight="fill" />} label="Workout calories" value={calorieSummary} />
              <SummaryStat
                icon={<CalendarCheck size={15} weight="fill" />}
                label="Active days"
                value={`${activeDays} of ${listDates(shown.start, shown.end).length}`}
              />
            </Panel>
          </motion.div>

          {range === 'D' ? (
            <motion.div custom={2} variants={fade} initial="hidden" animate="show">
              <TrainingSplit types={displayedTypes} fullWidth />
            </motion.div>
          ) : (
            <div className="display-lg-pair-grid display-lg-pair-grid--weighted-135">
              <motion.div custom={2} variants={fade} initial="hidden" animate="show" className="min-w-0">
                <Panel className={`flex h-full min-w-0 flex-col gap-4 p-5 ${CARD_HEIGHT.large}`}>
                  <SectionHeader
                    title="Training rhythm"
                    hint="Active minutes by workout type"
                    icon={<CalendarCheck size={18} weight="fill" className="text-recovery" />}
                  />
                  <div className="mt-auto">
                    <StackedColumnChart
                      data={days.map((day, index) => ({
                        key: day.date,
                        label: `${weekdayShort(day.date)} · ${shortDate(day.date)}`,
                        tick: workoutTick(range, day.date, index),
                        segments: displayedTypes.map((type): StackedColumnSegment => ({
                          key: type.label,
                          label: type.label,
                          value: durationByDayAndType.get(day.date)?.get(type.label) ?? 0,
                          color: workoutTone(type.label).color
                        }))
                      }))}
                      height={190}
                      format={formatMinutes}
                      unitLabel="active"
                      axisLabel="min"
                      onSelect={(point) => onSelectDate(point.key)}
                    />
                  </div>
                </Panel>
              </motion.div>

              <motion.div custom={3} variants={fade} initial="hidden" animate="show" className="min-w-0">
                <TrainingSplit types={displayedTypes} />
              </motion.div>
            </div>
          )}

          <motion.div custom={4} variants={fade} initial="hidden" animate="show">
            <Panel className="min-h-[164px] overflow-hidden">
              <div className="border-b border-hairline px-5 pb-3 pt-4">
                <SectionHeader
                  title={range === 'D' ? 'Sessions' : 'Workout history'}
                  hint={sessions.length ? `${sessions.length} in this range` : 'No sessions in this range'}
                  icon={<Barbell size={18} weight="fill" className="text-recovery" />}
                />
              </div>
              {groups.length > 0 ? (
                <div className="divide-y divide-hairline">
                  {groups.map((group) => (
                    <div key={group.date} className="px-3 py-3">
                      <div className="mb-1 flex items-baseline justify-between gap-3 px-3">
                        <h3 className="text-[12.5px] font-semibold text-ink">{longDate(group.date)}</h3>
                        <span className="text-[10.5px] text-ink-faint">
                          {group.workouts.length} session{group.workouts.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <WorkoutList workouts={group.workouts} onOpen={onOpenWorkout} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-[112px] place-items-center px-6 text-center">
                  <div>
                    <div className="text-[13px] font-medium text-ink-dim">No workouts recorded</div>
                    <p className="mt-1 text-[12px] text-ink-faint">
                      Tracked exercises will appear here automatically.
                    </p>
                  </div>
                </div>
              )}
            </Panel>
          </motion.div>
        </>
      )}
    </div>
  )
}

function SummaryStat({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col justify-center px-5 py-4">
      <div className="flex items-center gap-2 text-recovery">
        {icon}
        <span className="text-[11px] font-medium text-ink-faint">{label}</span>
      </div>
      <div className="mt-2 truncate font-mono text-[18px] font-medium tracking-tight text-ink">{value}</div>
    </div>
  )
}

interface DisplayedWorkoutType extends WorkoutTypeSummary {
  sourceLabels: string[]
}

function TrainingSplit({
  types,
  fullWidth = false
}: {
  types: DisplayedWorkoutType[]
  fullWidth?: boolean
}): React.JSX.Element {
  return (
    <Panel className={cn('training-split-panel flex h-full min-w-0 flex-col p-5', fullWidth ? 'min-h-[220px]' : CARD_HEIGHT.large)}>
      <SectionHeader
        title="Training split"
        hint="Share of active time"
        icon={<ChartDonut size={18} weight="fill" className="text-recovery" />}
      />
      {types.length > 0 ? (
        fullWidth ? (
          <>
            <div className="mt-6 flex h-2.5 overflow-hidden rounded-full bg-white/[0.04]">
              {types.map((type) => (
                <span
                  key={type.label}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${type.share}%`, background: workoutTone(type.label).color }}
                />
              ))}
            </div>
            <TrainingSplitLegend types={types} wide />
          </>
        ) : (
          <div className="training-split-period mt-5 flex-1">
            <TrainingSplitPie types={types} />
            <TrainingSplitLegend types={types} />
          </div>
        )
      ) : (
        <div className="grid flex-1 place-items-center text-center text-[13px] text-ink-faint">
          Your workout mix will appear here once sessions are recorded.
        </div>
      )}
    </Panel>
  )
}

function TrainingSplitPie({ types }: { types: DisplayedWorkoutType[] }): React.JSX.Element {
  let start = 0
  const slices = types.map((type) => {
    const slice = { type, start, end: start + type.share }
    start = slice.end
    return slice
  })
  const label = `Training split: ${types
    .map((type) => `${type.label} ${Math.round(type.share)} percent`)
    .join(', ')}`

  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={label}
      className="h-36 w-36 shrink-0 drop-shadow-[0_18px_24px_rgb(0_0_0/0.22)]"
    >
      <circle cx="60" cy="60" r="51" fill="rgb(255 255 255 / 0.035)" />
      {slices.map(({ type, start: sliceStart, end }) => {
        const color = workoutTone(type.label).color
        return type.share >= 99.999 ? (
          <circle
            key={type.label}
            cx="60"
            cy="60"
            r="50"
            fill={color}
            stroke="var(--color-panel)"
            strokeWidth="1"
          >
            <title>{`${type.label}: ${Math.round(type.share)}% · ${formatMinutes(type.durationMin)}`}</title>
          </circle>
        ) : (
          <path
            key={type.label}
            d={pieSlicePath(sliceStart, end)}
            fill={color}
            stroke="var(--color-panel)"
            strokeWidth="1"
            strokeLinejoin="round"
          >
            <title>{`${type.label}: ${Math.round(type.share)}% · ${formatMinutes(type.durationMin)}`}</title>
          </path>
        )
      })}
    </svg>
  )
}

function TrainingSplitLegend({
  types,
  wide = false
}: {
  types: DisplayedWorkoutType[]
  wide?: boolean
}): React.JSX.Element {
  return (
    <div className={cn('grid gap-x-10 gap-y-3', wide ? 'mt-4 display-lg-pair-grid' : 'w-full grid-cols-1')}>
      {types.map((type) => (
        <div key={type.label} className="flex min-w-0 items-center gap-3">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: workoutTone(type.label).color }}
          />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-dim">{type.label}</span>
          <span className="shrink-0 font-mono text-[11.5px] text-ink">{formatMinutes(type.durationMin)}</span>
          <span className="w-8 shrink-0 text-right font-mono text-[10.5px] text-ink-faint">
            {Math.round(type.share)}%
          </span>
        </div>
      ))}
    </div>
  )
}

function pieSlicePath(startPercent: number, endPercent: number): string {
  const point = (percent: number): { x: number; y: number } => {
    const radians = (percent / 100) * Math.PI * 2 - Math.PI / 2
    return { x: 60 + Math.cos(radians) * 50, y: 60 + Math.sin(radians) * 50 }
  }
  const start = point(startPercent)
  const end = point(endPercent)
  const largeArc = endPercent - startPercent > 50 ? 1 : 0
  return `M 60 60 L ${start.x} ${start.y} A 50 50 0 ${largeArc} 1 ${end.x} ${end.y} Z`
}

function WorkoutRangeTabs({
  range,
  onChange
}: {
  range: MetricRange
  onChange: (range: MetricRange) => void
}): React.JSX.Element {
  return (
    <div className="flex rounded-xl border border-hairline bg-white/[0.03] p-0.5">
      {RANGES.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          onClick={() => onChange(candidate.id)}
          className={cn(
            'relative rounded-[10px] px-3.5 py-1.5 text-[12px] font-semibold transition-colors',
            range === candidate.id ? 'text-ink' : 'text-ink-dim hover:text-ink'
          )}
        >
          {range === candidate.id && (
            <motion.span
              layoutId="workout-range-active"
              className="absolute inset-0 rounded-[10px] border border-hairline bg-white/[0.08]"
              transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            />
          )}
          <span className="relative z-10">{candidate.label}</span>
        </button>
      ))}
    </div>
  )
}

function WorkoutsSkeleton({ range }: { range: MetricRange }): React.JSX.Element {
  return (
    <>
      <Panel className={`display-sm-four-grid divide-x divide-hairline overflow-hidden ${CARD_HEIGHT.periodStats}`}>
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2 px-5 py-4" aria-hidden>
            <SkeletonText className="w-16" />
            <SkeletonBlock className="h-5 w-20" />
          </div>
        ))}
      </Panel>
      <div className={range === 'D' ? '' : 'display-lg-pair-grid display-lg-pair-grid--weighted-135'}>
        {range !== 'D' && (
          <Panel className={`flex flex-col gap-4 p-5 ${CARD_HEIGHT.large}`}>
            <SkeletonText className="w-28" />
            <SkeletonChart height={190} columns={range === 'W' ? 7 : 12} />
          </Panel>
        )}
        <Panel className={`training-split-panel flex flex-col gap-4 p-5 ${CARD_HEIGHT.large}`}>
          <SkeletonText className="w-28" />
          {range === 'D' ? (
            <>
              <SkeletonBlock className="mt-4 h-2.5 w-full rounded-full" />
              <div className="flex flex-col gap-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <SkeletonText key={index} className="w-full" />
                ))}
              </div>
            </>
          ) : (
            <div className="training-split-period flex-1">
              <SkeletonBlock className="h-36 w-36 shrink-0 rounded-full" />
              <div className="flex w-full flex-col gap-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <SkeletonText key={index} className="w-full" />
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>
      <Panel className="min-h-[164px] p-3">
        <SkeletonRows rows={2} />
      </Panel>
    </>
  )
}

function displayedWorkoutTypes(types: WorkoutTypeSummary[]): DisplayedWorkoutType[] {
  const visible = types.slice(0, 5).map((type) => ({ ...type, sourceLabels: [type.label] }))
  const overflow = types.slice(5)
  if (overflow.length === 0) return visible
  return [
    ...visible,
    {
      label: 'Other',
      sessions: overflow.reduce((sum, type) => sum + type.sessions, 0),
      durationMin: overflow.reduce((sum, type) => sum + type.durationMin, 0),
      share: overflow.reduce((sum, type) => sum + type.share, 0),
      sourceLabels: overflow.map((type) => type.label)
    }
  ]
}

function periodLabel(range: MetricRange, start: string, end: string): string {
  if (range === 'D') return longDate(end)
  return `${shortDate(start)} – ${shortDate(end)}`
}

function workoutTick(range: MetricRange, date: string, index: number): string | undefined {
  if (range === 'D') return weekdayShort(date)
  if (range === 'W') return weekdayShort(date).slice(0, 1)
  if (range === 'M') return index % 5 === 0 ? date.slice(8) : undefined
  if (range === '3M') return date.slice(8) === '01' ? shortDate(date).slice(0, 3) : undefined
  return date.slice(5) === '01-01' || date.slice(8) === '01' ? shortDate(date).slice(0, 3) : undefined
}

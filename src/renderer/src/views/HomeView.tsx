import { motion } from 'framer-motion'
import {
  Fire,
  Footprints,
  Heartbeat,
  Lightning,
  Moon,
  PersonSimpleRun,
  Pulse,
  Drop,
  Wind,
  Thermometer
} from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { ColumnChart, GaugeRing } from '@/components/charts'
import { MetricStat } from '@/components/MetricStat'
import { SleepStages } from '@/components/SleepStages'
import { baseline, baselineDeltaPct, metricAbsent, trendValues } from '@/lib/metrics'
import { formatClock, formatHour, formatInt, formatMinutes, greeting, isoToday, longDate, weekdayShort } from '@/lib/format'
import type { Goals, HealthDay } from '@shared/types'
import { cn } from '@/lib/utils'

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
  })
}

interface HomeViewProps {
  day: HealthDay
  goals: Goals
  loading: boolean
  onNavigate: (view: 'activity' | 'health' | 'sleep') => void
}

export function HomeView({ day, goals, loading, onNavigate }: HomeViewProps): React.JSX.Element {
  const m = day.metrics
  const isToday = day.date === isoToday()

  const rhrBase = baseline(day.trend, 'restingHeartRate', day.date)
  const signals = [
    {
      key: 'hrvMs' as const,
      icon: Pulse,
      label: 'HRV',
      unit: 'ms',
      accent: 'var(--color-recovery)',
      upIsGood: true,
      format: (v: number) => String(Math.round(v))
    },
    {
      key: 'spo2Pct' as const,
      icon: Drop,
      label: 'SpO2',
      unit: '%',
      accent: 'var(--color-hydration)',
      upIsGood: true,
      format: (v: number) => v.toFixed(0)
    },
    {
      key: 'breathingRate' as const,
      icon: Wind,
      label: 'Breathing',
      unit: 'brpm',
      accent: 'var(--color-sleep)',
      upIsGood: false,
      format: (v: number) => v.toFixed(1)
    },
    {
      key: 'skinTempDeltaC' as const,
      icon: Thermometer,
      label: 'Skin temp',
      unit: '°C',
      accent: 'var(--color-heart)',
      upIsGood: false,
      format: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`
    }
  ].filter((s) => !metricAbsent(day.trend, s.key))

  return (
    <div className={cn('mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12 transition-opacity', loading && 'opacity-60')}>
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <p className="text-[13px] font-medium text-ink-dim">{isToday ? greeting() : 'Reviewing'}</p>
        <h1 className="display mt-1 text-[27px] font-bold text-ink">{longDate(day.date)}</h1>
      </motion.header>

      {/* Hero: how is the day going vs goals, and how did the night set it up */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-wrap items-center justify-around gap-6">
            <Gauge
              value={m.steps}
              goal={goals.steps}
              color="var(--color-activity)"
              label="Steps"
              display={m.steps != null ? formatInt(m.steps) : '—'}
            />
            <Gauge
              value={m.caloriesOut}
              goal={goals.caloriesOut}
              color="var(--color-heart)"
              label="Calories"
              display={m.caloriesOut != null ? formatInt(m.caloriesOut) : '—'}
            />
            <Gauge
              value={m.activeZoneMinutes}
              goal={goals.activeZoneMinutes}
              color="var(--color-recovery)"
              label="Zone min"
              display={m.activeZoneMinutes != null ? String(m.activeZoneMinutes) : '—'}
            />
          </div>

          <div className="flex min-w-[220px] flex-col justify-center gap-3 lg:border-l lg:border-hairline lg:pl-6">
            <HeroRow
              icon={<Moon size={15} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
              label="Sleep"
              value={m.sleepMinutes != null ? formatMinutes(m.sleepMinutes) : 'No data'}
              sub={
                m.sleepMinutes != null
                  ? `${Math.round((m.sleepMinutes / goals.sleepMinutes) * 100)}% of ${formatMinutes(goals.sleepMinutes)} goal`
                  : undefined
              }
              onClick={() => onNavigate('sleep')}
            />
            <HeroRow
              icon={<Heartbeat size={15} weight="fill" style={{ color: 'var(--color-heart)' }} />}
              label="Resting HR"
              value={m.restingHeartRate != null ? `${m.restingHeartRate} bpm` : 'No data'}
              sub={
                m.restingHeartRate != null && rhrBase != null
                  ? `${m.restingHeartRate > Math.round(rhrBase) ? '+' : ''}${m.restingHeartRate - Math.round(rhrBase)} vs your average`
                  : undefined
              }
              onClick={() => onNavigate('health')}
            />
            <HeroRow
              icon={<PersonSimpleRun size={15} weight="fill" style={{ color: 'var(--color-activity)' }} />}
              label="Workouts"
              value={day.workouts.length > 0 ? `${day.workouts.length} logged` : 'None yet'}
              sub={
                day.workouts.length > 0
                  ? day.workouts.map((w) => w.name).slice(0, 2).join(', ')
                  : undefined
              }
              onClick={() => onNavigate('activity')}
            />
          </div>
        </Panel>
      </motion.div>

      {/* Daily movement: when did I move? */}
      {day.stepsHourly.length > 0 && (
        <motion.div custom={2} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-4 p-6">
            <SectionHeader
              title="Daily movement"
              hint="Steps per hour"
              icon={<Footprints size={18} weight="fill" style={{ color: 'var(--color-activity)' }} />}
            />
            <ColumnChart
              data={day.stepsHourly.map((h) => ({
                key: String(h.hour),
                label: formatHour(h.hour),
                value: h.steps,
                tick: h.hour % 6 === 0 ? formatHour(h.hour) : undefined
              }))}
              color="var(--color-activity)"
              format={formatInt}
              unitLabel="steps"
            />
          </Panel>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        {/* 14-day movement volume */}
        <motion.div custom={3} variants={fade} initial="hidden" animate="show">
          <Panel className="flex h-full flex-col gap-4 p-6">
            <SectionHeader
              title="Steps, last 14 days"
              hint="Is movement volume changing?"
              icon={<Lightning size={18} weight="fill" style={{ color: 'var(--color-activity)' }} />}
            />
            <div className="mt-auto">
              <ColumnChart
                data={day.trend.map((d) => ({
                  key: d.date,
                  label: `${weekdayShort(d.date)} · ${d.date.slice(5)}`,
                  value: d.steps,
                  tick: weekdayShort(d.date).slice(0, 1)
                }))}
                color="var(--color-activity)"
                goal={{ value: goals.steps, label: 'goal' }}
                emphasisIndex={day.trend.findIndex((d) => d.date === day.date)}
                format={formatInt}
                unitLabel="steps"
              />
            </div>
          </Panel>
        </motion.div>

        {/* Last night */}
        <motion.div custom={4} variants={fade} initial="hidden" animate="show">
          <Panel className="flex h-full flex-col gap-4 p-6">
            <SectionHeader
              title="Sleep"
              hint={
                day.sleep
                  ? `${formatMinutes(day.sleep.minutesAsleep)} asleep · ${formatClock(day.sleep.startTime)}–${formatClock(day.sleep.endTime)}`
                  : 'No sleep recorded'
              }
              icon={<Moon size={18} weight="fill" style={{ color: 'var(--color-sleep)' }} />}
            />
            {day.sleep ? (
              <SleepStages night={day.sleep} />
            ) : (
              <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">
                Wear your Fitbit Air to bed to see sleep stages.
              </div>
            )}
          </Panel>
        </motion.div>
      </div>

      {/* Night signals vs personal baseline */}
      {signals.length > 0 && (
        <motion.div custom={5} variants={fade} initial="hidden" animate="show">
          <Panel className="overflow-hidden">
            <div className="border-b border-hairline px-5 pb-3 pt-4">
              <SectionHeader title="Night signals" hint="Compared with your own recent baseline" />
            </div>
            <div className="grid grid-cols-2 divide-x divide-hairline lg:grid-cols-4">
              {signals.map((s) => {
                const value = day.metrics[s.key]
                const base = baseline(day.trend, s.key, day.date)
                return (
                  <MetricStat
                    key={s.key}
                    icon={s.icon}
                    label={s.label}
                    value={value != null ? s.format(value) : '—'}
                    unit={s.unit}
                    accent={s.accent}
                    deltaPct={s.key === 'skinTempDeltaC' ? null : baselineDeltaPct(value, base)}
                    upIsGood={s.upIsGood}
                    spark={trendValues(day.trend, s.key).map((p) => p.value)}
                    sub={s.key === 'skinTempDeltaC' ? 'vs device baseline' : undefined}
                  />
                )
              })}
            </div>
          </Panel>
        </motion.div>
      )}

      {/* Workouts */}
      {day.workouts.length > 0 && (
        <motion.div custom={6} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-1 p-3">
            {day.workouts.map((w) => (
              <button
                key={w.id}
                onClick={() => onNavigate('activity')}
                className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-activity-soft">
                    <Fire size={16} weight="fill" style={{ color: 'var(--color-activity)' }} />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-ink">{w.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {formatClock(w.startTime)} · {formatMinutes(w.durationMin)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-ink-dim">
                  {w.calories != null && <span>{formatInt(w.calories)} kcal</span>}
                  {w.avgHeartRate != null && <span>{w.avgHeartRate} bpm</span>}
                </div>
              </button>
            ))}
          </Panel>
        </motion.div>
      )}
    </div>
  )
}

function Gauge({
  value,
  goal,
  color,
  label,
  display
}: {
  value: number | null
  goal: number
  color: string
  label: string
  display: string
}): React.JSX.Element {
  const pct = value != null && goal > 0 ? Math.round((value / goal) * 100) : null
  return (
    <div className="flex flex-col items-center gap-2">
      <GaugeRing value={value ?? 0} goal={goal} color={color} size={128} stroke={11}>
        <div className="text-center">
          <div className="text-[22px] font-semibold leading-none tracking-tight text-ink">{display}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">{label}</div>
        </div>
      </GaugeRing>
      <span className="font-mono text-[11px] text-ink-dim">{pct != null ? `${pct}% of ${formatInt(goal)}` : 'no goal data'}</span>
    </div>
  )
}

function HeroRow({
  icon,
  label,
  value,
  sub,
  onClick
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="-mx-2 flex items-start gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04]"
    >
      <span className="mt-0.5">{icon}</span>
      <span className="flex flex-col">
        <span className="text-[11px] font-medium text-ink-faint">{label}</span>
        <span className="text-[14.5px] font-semibold text-ink">{value}</span>
        {sub && <span className="mt-0.5 text-[11px] text-ink-dim">{sub}</span>}
      </span>
    </button>
  )
}

import { motion } from 'framer-motion'
import {
  Barbell,
  Fire,
  Footprints,
  Lightning,
  MapPin,
  Mountains,
  PersonSimpleRun,
  Armchair
} from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { ColumnChart } from '@/components/charts'
import { MetricStat } from '@/components/MetricStat'
import { baseline, baselineDeltaPct, trendValues } from '@/lib/metrics'
import { formatClock, formatHour, formatInt, formatMinutes, longDate, weekdayShort } from '@/lib/format'
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

interface ActivityViewProps {
  day: HealthDay
  goals: Goals
  loading: boolean
}

export function ActivityView({ day, goals, loading }: ActivityViewProps): React.JSX.Element {
  const m = day.metrics
  const emphasis = day.trend.findIndex((d) => d.date === day.date)
  const trendData = (key: 'steps' | 'activeZoneMinutes' | 'caloriesOut' | 'distanceKm') =>
    day.trend.map((d) => ({
      key: d.date,
      label: `${weekdayShort(d.date)} · ${d.date.slice(5)}`,
      value: d[key],
      tick: weekdayShort(d.date).slice(0, 1)
    }))

  return (
    <div className={cn('mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12 transition-opacity', loading && 'opacity-60')}>
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Activity</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(day.date)}</p>
      </motion.header>

      {/* Day totals */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className="grid grid-cols-2 divide-x divide-y divide-hairline overflow-hidden sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <MetricStat
            icon={Footprints}
            label="Steps"
            value={m.steps != null ? formatInt(m.steps) : '—'}
            accent="var(--color-activity)"
            deltaPct={baselineDeltaPct(m.steps, baseline(day.trend, 'steps', day.date))}
            spark={trendValues(day.trend, 'steps').map((p) => p.value)}
          />
          <MetricStat
            icon={MapPin}
            label="Distance"
            value={m.distanceKm != null ? m.distanceKm.toFixed(2) : '—'}
            unit="km"
            accent="var(--color-activity)"
            spark={trendValues(day.trend, 'distanceKm').map((p) => p.value)}
          />
          <MetricStat
            icon={Fire}
            label="Calories"
            value={m.caloriesOut != null ? formatInt(m.caloriesOut) : '—'}
            unit="kcal"
            accent="var(--color-heart)"
            deltaPct={baselineDeltaPct(m.caloriesOut, baseline(day.trend, 'caloriesOut', day.date))}
            spark={trendValues(day.trend, 'caloriesOut').map((p) => p.value)}
          />
          <MetricStat
            icon={Lightning}
            label="Zone minutes"
            value={m.activeZoneMinutes != null ? String(m.activeZoneMinutes) : '—'}
            unit="min"
            accent="var(--color-recovery)"
            spark={trendValues(day.trend, 'activeZoneMinutes').map((p) => p.value)}
          />
          <MetricStat
            icon={Mountains}
            label="Floors"
            value={m.floors != null ? String(m.floors) : '—'}
            accent="var(--color-hydration)"
          />
          <MetricStat
            icon={Armchair}
            label="Sedentary"
            value={m.sedentaryMinutes != null ? formatMinutes(m.sedentaryMinutes) : '—'}
            accent="var(--color-body-metric)"
            upIsGood={false}
            deltaPct={baselineDeltaPct(m.sedentaryMinutes, baseline(day.trend, 'sedentaryMinutes', day.date))}
          />
        </Panel>
      </motion.div>

      {/* Hourly movement */}
      {day.stepsHourly.length > 0 && (
        <motion.div custom={2} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-4 p-6">
            <SectionHeader
              title="Hourly steps"
              hint="When did you move?"
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
              height={170}
              format={formatInt}
              unitLabel="steps"
            />
          </Panel>
        </motion.div>
      )}

      {/* Workouts */}
      {day.workouts.length > 0 && (
        <motion.div custom={3} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-1 p-3">
            <div className="px-3 pb-1 pt-2">
              <SectionHeader
                title="Workouts"
                hint={`${day.workouts.length} session${day.workouts.length > 1 ? 's' : ''}`}
                icon={<Barbell size={18} weight="fill" style={{ color: 'var(--color-recovery)' }} />}
              />
            </div>
            {day.workouts.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-recovery-soft">
                    <PersonSimpleRun size={17} weight="fill" style={{ color: 'var(--color-recovery)' }} />
                  </div>
                  <div>
                    <div className="text-[13.5px] font-semibold text-ink">{w.name}</div>
                    <div className="text-[11px] text-ink-faint">
                      {formatClock(w.startTime)} · {formatMinutes(w.durationMin)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-5 text-[12px] text-ink-dim">
                  {w.distanceKm != null && <Fact label="km" value={w.distanceKm.toFixed(2)} />}
                  {w.calories != null && <Fact label="kcal" value={formatInt(w.calories)} />}
                  {w.avgHeartRate != null && <Fact label="avg bpm" value={String(w.avgHeartRate)} />}
                  {w.activeZoneMinutes != null && <Fact label="zone min" value={String(w.activeZoneMinutes)} />}
                </div>
              </div>
            ))}
          </Panel>
        </motion.div>
      )}

      {/* 14-day trends */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TrendPanel index={4} title="Steps" hint="14 days" color="var(--color-activity)">
          <ColumnChart
            data={trendData('steps')}
            color="var(--color-activity)"
            goal={{ value: goals.steps, label: 'goal' }}
            emphasisIndex={emphasis}
            format={formatInt}
            unitLabel="steps"
          />
        </TrendPanel>
        <TrendPanel index={5} title="Zone minutes" hint="14 days" color="var(--color-recovery)">
          <ColumnChart
            data={trendData('activeZoneMinutes')}
            color="var(--color-recovery)"
            goal={{ value: goals.activeZoneMinutes, label: 'goal' }}
            emphasisIndex={emphasis}
            unitLabel="min"
          />
        </TrendPanel>
        <TrendPanel index={6} title="Calories burned" hint="14 days" color="var(--color-heart)">
          <ColumnChart
            data={trendData('caloriesOut')}
            color="var(--color-heart)"
            goal={{ value: goals.caloriesOut, label: 'goal' }}
            emphasisIndex={emphasis}
            format={formatInt}
            unitLabel="kcal"
          />
        </TrendPanel>
        <TrendPanel index={7} title="Distance" hint="14 days" color="var(--color-hydration)">
          <ColumnChart
            data={trendData('distanceKm')}
            color="var(--color-hydration)"
            emphasisIndex={emphasis}
            format={(v) => v.toFixed(1)}
            unitLabel="km"
          />
        </TrendPanel>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-mono text-[12.5px] text-ink">{value}</span>
      <span className="text-[10.5px] text-ink-faint">{label}</span>
    </span>
  )
}

function TrendPanel({
  index,
  title,
  hint,
  color,
  children
}: {
  index: number
  title: string
  hint: string
  color: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <motion.div custom={index} variants={fade} initial="hidden" animate="show">
      <Panel className="flex flex-col gap-5 p-6">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <h3 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h3>
          <span className="text-[11.5px] text-ink-faint">{hint}</span>
        </div>
        {children}
      </Panel>
    </motion.div>
  )
}

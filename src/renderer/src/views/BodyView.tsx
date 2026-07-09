import { motion } from 'framer-motion'
import { Drop, ForkKnife, Percent, Scales } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { ColumnChart, TrendLine } from '@/components/charts'
import { metricAbsent } from '@/lib/metrics'
import { formatInt, longDate, shortDate, weekdayShort } from '@/lib/format'
import type { HealthDay } from '@shared/types'
import { cn } from '@/lib/utils'

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
  })
}

interface BodyViewProps {
  day: HealthDay
  loading: boolean
}

export function BodyView({ day, loading }: BodyViewProps): React.JSX.Element {
  const m = day.metrics
  const hasWeight = !metricAbsent(day.trend, 'weightKg')
  const hasFat = !metricAbsent(day.trend, 'bodyFatPct')
  const hasWater = !metricAbsent(day.trend, 'waterMl')
  const hasIntake = !metricAbsent(day.trend, 'caloriesIn')
  const emphasis = day.trend.findIndex((d) => d.date === day.date)

  const lastWeight = [...day.trend].reverse().find((d) => d.weightKg != null)?.weightKg
  const lastFat = [...day.trend].reverse().find((d) => d.bodyFatPct != null)?.bodyFatPct

  const empty = !hasWeight && !hasFat && !hasWater && !hasIntake

  return (
    <div className={cn('mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12 transition-opacity', loading && 'opacity-60')}>
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Body</h1>
        <p className="mt-1 text-[13px] text-ink-dim">
          {longDate(day.date)} · logged measurements, read as trends
        </p>
      </motion.header>

      {empty ? (
        <Panel className="grid place-items-center p-12 text-center text-[13px] leading-relaxed text-ink-faint">
          Nothing logged in this window. Weight, body fat, water, and food entries from the Fitbit app
          appear here.
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {hasWeight && (
            <motion.div custom={1} variants={fade} initial="hidden" animate="show">
              <Panel className="flex flex-col gap-4 p-6">
                <SectionHeader
                  title="Weight"
                  hint="Bioimpedance scales estimate — watch the trend, not the reading"
                  icon={<Scales size={18} weight="fill" style={{ color: 'var(--color-body-metric)' }} />}
                  action={
                    lastWeight != null ? (
                      <span className="text-[20px] font-semibold text-ink">
                        {lastWeight.toFixed(1)} <span className="text-[12px] font-normal text-ink-dim">kg</span>
                      </span>
                    ) : undefined
                  }
                />
                <TrendLine
                  data={day.trend.map((d) => ({
                    date: d.date,
                    label: `${weekdayShort(d.date)} · ${shortDate(d.date)}`,
                    value: d.weightKg
                  }))}
                  color="var(--color-body-metric)"
                  format={(v) => v.toFixed(1)}
                  unitLabel="kg"
                />
              </Panel>
            </motion.div>
          )}

          {hasFat && (
            <motion.div custom={2} variants={fade} initial="hidden" animate="show">
              <Panel className="flex flex-col gap-4 p-6">
                <SectionHeader
                  title="Body fat"
                  hint="Estimated percentage"
                  icon={<Percent size={18} weight="fill" style={{ color: 'var(--color-heart)' }} />}
                  action={
                    lastFat != null ? (
                      <span className="text-[20px] font-semibold text-ink">
                        {lastFat.toFixed(1)} <span className="text-[12px] font-normal text-ink-dim">%</span>
                      </span>
                    ) : undefined
                  }
                />
                <TrendLine
                  data={day.trend.map((d) => ({
                    date: d.date,
                    label: `${weekdayShort(d.date)} · ${shortDate(d.date)}`,
                    value: d.bodyFatPct
                  }))}
                  color="var(--color-heart)"
                  format={(v) => v.toFixed(1)}
                  unitLabel="%"
                />
              </Panel>
            </motion.div>
          )}

          {hasWater && (
            <motion.div custom={3} variants={fade} initial="hidden" animate="show">
              <Panel className="flex flex-col gap-4 p-6">
                <SectionHeader
                  title="Water"
                  hint="Logged intake — missing logs aren't zero"
                  icon={<Drop size={18} weight="fill" style={{ color: 'var(--color-hydration)' }} />}
                  action={
                    m.waterMl != null ? (
                      <span className="text-[20px] font-semibold text-ink">
                        {formatInt(m.waterMl)} <span className="text-[12px] font-normal text-ink-dim">ml</span>
                      </span>
                    ) : undefined
                  }
                />
                <ColumnChart
                  data={day.trend.map((d) => ({
                    key: d.date,
                    label: `${weekdayShort(d.date)} · ${shortDate(d.date)}`,
                    value: d.waterMl,
                    tick: weekdayShort(d.date).slice(0, 1)
                  }))}
                  color="var(--color-hydration)"
                  emphasisIndex={emphasis}
                  format={(v) => `${formatInt(v)} ml`}
                />
              </Panel>
            </motion.div>
          )}

          {hasIntake && (
            <motion.div custom={4} variants={fade} initial="hidden" animate="show">
              <Panel className="flex flex-col gap-4 p-6">
                <SectionHeader
                  title="Calories in"
                  hint={
                    m.caloriesIn != null && m.caloriesOut != null
                      ? `Net ${m.caloriesIn - m.caloriesOut > 0 ? '+' : ''}${formatInt(m.caloriesIn - m.caloriesOut)} kcal vs burned today`
                      : 'Logged food energy'
                  }
                  icon={<ForkKnife size={18} weight="fill" style={{ color: 'var(--color-activity)' }} />}
                  action={
                    m.caloriesIn != null ? (
                      <span className="text-[20px] font-semibold text-ink">
                        {formatInt(m.caloriesIn)} <span className="text-[12px] font-normal text-ink-dim">kcal</span>
                      </span>
                    ) : undefined
                  }
                />
                <ColumnChart
                  data={day.trend.map((d) => ({
                    key: d.date,
                    label: `${weekdayShort(d.date)} · ${shortDate(d.date)}`,
                    value: d.caloriesIn,
                    tick: weekdayShort(d.date).slice(0, 1)
                  }))}
                  color="var(--color-activity)"
                  emphasisIndex={emphasis}
                  format={formatInt}
                  unitLabel="kcal"
                />
              </Panel>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}

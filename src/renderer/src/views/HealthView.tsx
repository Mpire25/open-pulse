import { motion } from 'framer-motion'
import { Drop, Gauge, Heartbeat, Pulse, Thermometer, Wind } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { IntradayLine, TrendLine } from '@/components/charts'
import { baseline, metricAbsent, type MetricKey } from '@/lib/metrics'
import { longDate, shortDate, weekdayShort } from '@/lib/format'
import type { HealthDay } from '@shared/types'
import { cn } from '@/lib/utils'
import type { Icon } from '@phosphor-icons/react'

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
  })
}

interface VitalSpec {
  key: MetricKey
  title: string
  icon: Icon
  color: string
  unit: string
  format: (v: number) => string
  hint: string
  baselineLabel?: string
}

const VITALS: VitalSpec[] = [
  {
    key: 'restingHeartRate',
    title: 'Resting heart rate',
    icon: Heartbeat,
    color: 'var(--color-heart)',
    unit: 'bpm',
    format: (v) => String(Math.round(v)),
    hint: 'Lower usually means better recovery'
  },
  {
    key: 'hrvMs',
    title: 'Heart rate variability',
    icon: Pulse,
    color: 'var(--color-recovery)',
    unit: 'ms',
    format: (v) => String(Math.round(v)),
    hint: 'Read against your own baseline, not a universal number'
  },
  {
    key: 'spo2Pct',
    title: 'Blood oxygen',
    icon: Drop,
    color: 'var(--color-hydration)',
    unit: '%',
    format: (v) => v.toFixed(1),
    hint: 'Nightly average SpO2'
  },
  {
    key: 'breathingRate',
    title: 'Respiratory rate',
    icon: Wind,
    color: 'var(--color-sleep)',
    unit: 'brpm',
    format: (v) => v.toFixed(1),
    hint: 'Breaths per minute during sleep'
  },
  {
    key: 'skinTempDeltaC',
    title: 'Skin temperature',
    icon: Thermometer,
    color: 'var(--color-body-metric)',
    unit: '°C',
    format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`,
    hint: 'Nightly deviation from your device baseline',
    baselineLabel: 'baseline'
  },
  {
    key: 'vo2Max',
    title: 'Cardio fitness',
    icon: Gauge,
    color: 'var(--color-activity)',
    unit: 'VO2 max',
    format: (v) => v.toFixed(1),
    hint: 'Estimated maximal oxygen uptake'
  }
]

interface HealthViewProps {
  day: HealthDay
  loading: boolean
}

export function HealthView({ day, loading }: HealthViewProps): React.JSX.Element {
  const visible = VITALS.filter((v) => !metricAbsent(day.trend, v.key))

  return (
    <div className={cn('mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12 transition-opacity', loading && 'opacity-60')}>
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="display text-[27px] font-bold text-ink">Health</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{longDate(day.date)}</p>
      </motion.header>

      {/* Intraday heart rate */}
      {day.heartRate.length > 1 && (
        <motion.div custom={1} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-4 p-6">
            <SectionHeader
              title="Heart rate"
              hint="Across the day"
              icon={<Heartbeat size={18} weight="fill" style={{ color: 'var(--color-heart)' }} />}
              action={
                day.currentHeartRate != null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[20px] font-semibold text-ink">{day.currentHeartRate}</span>
                    <span className="text-[12px] text-ink-dim">bpm now</span>
                  </div>
                ) : day.metrics.restingHeartRate != null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-[20px] font-semibold text-ink">{day.metrics.restingHeartRate}</span>
                    <span className="text-[12px] text-ink-dim">bpm resting</span>
                  </div>
                ) : undefined
              }
            />
            <IntradayLine points={day.heartRate} color="var(--color-heart)" />
          </Panel>
        </motion.div>
      )}

      {visible.length === 0 && day.heartRate.length <= 1 ? (
        <Panel className="grid place-items-center p-12 text-[13px] text-ink-faint">
          No vitals recorded in this window yet. They appear after your tracker syncs a night of data.
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {visible.map((v, i) => (
            <VitalPanel key={v.key} spec={v} day={day} index={i + 2} />
          ))}
        </div>
      )}
    </div>
  )
}

function VitalPanel({ spec, day, index }: { spec: VitalSpec; day: HealthDay; index: number }): React.JSX.Element {
  const value = day.metrics[spec.key]
  const base = baseline(day.trend, spec.key, day.date)
  const Icon = spec.icon
  return (
    <motion.div custom={index} variants={fade} initial="hidden" animate="show">
      <Panel className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Icon size={18} weight="fill" style={{ color: spec.color }} />
            <div>
              <h3 className="text-[14.5px] font-semibold tracking-tight text-ink">{spec.title}</h3>
              <p className="mt-0.5 text-[11.5px] text-ink-faint">{spec.hint}</p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[22px] font-semibold tracking-tight text-ink">
              {value != null ? spec.format(value) : '—'}
            </span>
            <span className="text-[11.5px] text-ink-dim">{spec.unit}</span>
          </div>
        </div>
        <TrendLine
          data={day.trend.map((d) => ({
            date: d.date,
            label: `${weekdayShort(d.date)} · ${shortDate(d.date)}`,
            value: d[spec.key]
          }))}
          color={spec.color}
          height={130}
          format={spec.format}
          baseline={
            spec.key === 'skinTempDeltaC'
              ? { value: 0, label: spec.baselineLabel ?? '0' }
              : base != null
                ? { value: base, label: '7d avg' }
                : null
          }
          unitLabel={spec.unit}
        />
      </Panel>
    </motion.div>
  )
}

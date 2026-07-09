import { motion } from 'framer-motion'
import {
  Drop,
  Footprints,
  Heartbeat,
  Lightning,
  Mountains,
  Pulse as PulseIcon,
  Wind
} from '@phosphor-icons/react'
import { ActivityRings, type RingSpec } from '@/components/ActivityRings'
import { RingLegend } from '@/components/RingLegend'
import { HeartRateChart } from '@/components/HeartRateChart'
import { SleepStages } from '@/components/SleepStages'
import { StatTile } from '@/components/StatTile'
import { Panel, SectionHeader } from '@/components/Panel'
import { useDashboard } from '@/hooks/useHealth'
import { formatInt, formatMinutes, greeting, longDate } from '@/lib/format'
import type { DashboardToday } from '@shared/types'

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
  })
}

export function TodayView(): React.JSX.Element {
  const { data, loading, error, refresh } = useDashboard()

  if (loading && !data) return <TodaySkeleton />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />
  if (!data) return <></>

  return <TodayContent data={data} />
}

function TodayContent({ data }: { data: DashboardToday }): React.JSX.Element {
  const rings: RingSpec[] = [
    {
      key: 'move',
      label: 'Move',
      value: data.activeEnergyKcal.current,
      goal: data.activeEnergyKcal.goal,
      color: 'var(--color-move)',
      trackColor: 'var(--color-move-soft)',
      unit: 'kcal'
    },
    {
      key: 'exercise',
      label: 'Exercise',
      value: data.activeZoneMinutes.current,
      goal: data.activeZoneMinutes.goal,
      color: 'var(--color-exercise)',
      trackColor: 'var(--color-exercise-soft)',
      unit: 'min'
    },
    {
      key: 'steps',
      label: 'Steps',
      value: data.steps.current,
      goal: data.steps.goal,
      color: 'var(--color-stand)',
      trackColor: 'var(--color-stand-soft)',
      unit: 'steps'
    }
  ]

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <p className="text-[13px] font-medium text-ink-dim">{greeting()}</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-ink">{longDate(data.date)}</h1>
      </motion.header>

      {/* Hero: rings + legend, asymmetric split */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className="grid grid-cols-1 gap-8 p-7 lg:grid-cols-[auto_1fr]">
          <div className="grid place-items-center">
            <div className="relative">
              <ActivityRings rings={rings} size={230} strokeWidth={22} gap={7} />
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="font-mono text-[26px] font-semibold leading-none text-ink">
                    {formatInt(data.steps.current)}
                  </div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-ink-faint">steps</div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <RingLegend
              items={rings.map((r) => ({
                label: r.label,
                value: r.value,
                goal: r.goal,
                unit: r.unit,
                color: r.color
              }))}
            />
          </div>
        </Panel>
      </motion.div>

      {/* Vitals row: no card boxes, 1px dividers */}
      <motion.div custom={2} variants={fade} initial="hidden" animate="show">
        <Panel className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0 overflow-hidden">
          <StatTile
            icon={Heartbeat}
            label="Heart"
            value={data.currentHeartRate != null ? String(data.currentHeartRate) : '—'}
            unit="bpm"
            accent="var(--color-move)"
            sub={data.restingHeartRate != null ? `Resting ${data.restingHeartRate}` : undefined}
          />
          <StatTile
            icon={PulseIcon}
            label="HRV"
            value={data.hrvMs != null ? String(Math.round(data.hrvMs)) : '—'}
            unit="ms"
            accent="var(--color-stand)"
          />
          <StatTile
            icon={Drop}
            label="SpO2"
            value={data.spo2Pct != null ? data.spo2Pct.toFixed(0) : '—'}
            unit="%"
            accent="var(--color-accent)"
          />
          <StatTile
            icon={Wind}
            label="Breathing"
            value={data.breathingRate != null ? data.breathingRate.toFixed(1) : '—'}
            unit="brpm"
            accent="var(--color-sleep-rem)"
          />
          <StatTile
            icon={Footprints}
            label="Distance"
            value={data.distanceKm.toFixed(2)}
            unit="km"
            accent="var(--color-exercise)"
          />
          <StatTile icon={Mountains} label="Floors" value={String(data.floors)} accent="var(--color-sleep-core)" />
        </Panel>
      </motion.div>

      {/* Heart rate + last night sleep */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        <motion.div custom={3} variants={fade} initial="hidden" animate="show">
          <Panel className="flex h-full flex-col gap-4 p-6">
            <SectionHeader
              title="Heart rate"
              hint="Today, intraday"
              icon={<Heartbeat size={18} weight="fill" className="text-move" />}
              action={
                data.currentHeartRate != null ? (
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-[20px] font-medium text-ink">{data.currentHeartRate}</span>
                    <span className="text-[12px] text-ink-dim">bpm</span>
                  </div>
                ) : undefined
              }
            />
            <div className="mt-auto">
              <HeartRateChart series={data.heartRateSeries} />
            </div>
          </Panel>
        </motion.div>

        <motion.div custom={4} variants={fade} initial="hidden" animate="show">
          <Panel className="flex h-full flex-col gap-4 p-6">
            <SectionHeader
              title="Last night"
              hint={
                data.sleep
                  ? `${formatMinutes(data.sleep.minutesAsleep)} asleep`
                  : 'No sleep recorded'
              }
              icon={<Lightning size={18} weight="fill" className="text-sleep-core" />}
            />
            {data.sleep ? (
              <SleepStages night={data.sleep} />
            ) : (
              <div className="grid flex-1 place-items-center text-[13px] text-ink-faint">
                Wear your Fitbit Air to bed to see sleep stages.
              </div>
            )}
          </Panel>
        </motion.div>
      </div>
    </div>
  )
}

function TodaySkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-[1180px] animate-pulse flex-col gap-5 px-8 pt-2">
      <div className="h-9 w-64 rounded-lg bg-white/5" />
      <div className="h-64 rounded-[22px] bg-white/5" />
      <div className="h-24 rounded-[22px] bg-white/5" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="h-56 rounded-[22px] bg-white/5" />
        <div className="h-56 rounded-[22px] bg-white/5" />
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }): React.JSX.Element {
  return (
    <div className="grid h-full place-items-center px-8">
      <div className="max-w-sm text-center">
        <h2 className="text-[15px] font-semibold text-ink">Couldn’t load your data</h2>
        <p className="mt-2 text-[13px] text-ink-dim">{message}</p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-full bg-panel-2 px-4 py-2 text-[13px] text-ink transition-colors hover:bg-white/10"
        >
          Try again
        </button>
      </div>
    </div>
  )
}

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Footprints, Lightning, Moon, Heart } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { BarTrend } from '@/components/BarTrend'
import { useWeek } from '@/hooks/useHealth'
import { formatInt, formatMinutes } from '@/lib/format'
import type { WeekSeries } from '@shared/types'

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.05 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
  })
}

export function TrendsView(): React.JSX.Element {
  const { data, loading } = useWeek()

  if (loading && !data) {
    return (
      <div className="mx-auto grid max-w-[1180px] animate-pulse grid-cols-1 gap-5 px-8 pt-2 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 rounded-[22px] bg-white/5" />
        ))}
      </div>
    )
  }
  if (!data) return <></>

  return <TrendsContent data={data} />
}

function TrendsContent({ data }: { data: WeekSeries }): React.JSX.Element {
  const stats = useMemo(() => {
    const days = data.days
    const avg = (sel: (d: WeekSeries['days'][number]) => number): number =>
      days.reduce((sum, d) => sum + sel(d), 0) / (days.length || 1)
    return {
      steps: avg((d) => d.steps),
      azm: days.reduce((s, d) => s + d.activeZoneMinutes, 0),
      kcal: avg((d) => d.activeEnergyKcal),
      sleep: avg((d) => d.sleepMinutes),
      rhr: avg((d) => d.restingHeartRate ?? 0),
      hrv: avg((d) => d.hrvMs ?? 0)
    }
  }, [data])

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header custom={0} variants={fade} initial="hidden" animate="show" className="pt-2">
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">Trends</h1>
        <p className="mt-1 text-[13px] text-ink-dim">Your last 7 days at a glance.</p>
      </motion.header>

      {/* Summary strip */}
      <motion.div custom={1} variants={fade} initial="hidden" animate="show">
        <Panel className="grid grid-cols-2 divide-x divide-y divide-hairline overflow-hidden md:grid-cols-4 md:divide-y-0">
          <Summary label="Avg steps" value={formatInt(stats.steps)} accent="var(--color-stand)" />
          <Summary label="Zone minutes" value={`${formatInt(stats.azm)}`} sub="total" accent="var(--color-exercise)" />
          <Summary label="Avg resting HR" value={`${Math.round(stats.rhr)}`} sub="bpm" accent="var(--color-move)" />
          <Summary label="Avg HRV" value={`${Math.round(stats.hrv)}`} sub="ms" accent="var(--color-sleep-rem)" />
        </Panel>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <motion.div custom={2} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-6 p-6">
            <SectionHeader
              title="Steps"
              hint={`${formatInt(stats.steps)} daily average`}
              icon={<Footprints size={18} weight="fill" className="text-stand" />}
            />
            <BarTrend
              data={data.days.map((d) => ({ date: d.date, value: d.steps }))}
              color="var(--color-stand)"
              formatValue={formatInt}
            />
          </Panel>
        </motion.div>

        <motion.div custom={3} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-6 p-6">
            <SectionHeader
              title="Active zone minutes"
              hint={`${formatInt(stats.azm)} this week`}
              icon={<Lightning size={18} weight="fill" className="text-exercise" />}
            />
            <BarTrend
              data={data.days.map((d) => ({ date: d.date, value: d.activeZoneMinutes }))}
              color="var(--color-exercise)"
            />
          </Panel>
        </motion.div>

        <motion.div custom={4} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-6 p-6">
            <SectionHeader
              title="Sleep duration"
              hint={`${formatMinutes(stats.sleep)} average`}
              icon={<Moon size={18} weight="fill" className="text-sleep-core" />}
            />
            <BarTrend
              data={data.days.map((d) => ({ date: d.date, value: d.sleepMinutes }))}
              color="var(--color-sleep-core)"
              formatValue={(v) => formatMinutes(v)}
            />
          </Panel>
        </motion.div>

        <motion.div custom={5} variants={fade} initial="hidden" animate="show">
          <Panel className="flex flex-col gap-6 p-6">
            <SectionHeader
              title="Resting heart rate"
              hint={`${Math.round(stats.rhr)} bpm average`}
              icon={<Heart size={18} weight="fill" className="text-move" />}
            />
            <BarTrend
              data={data.days.map((d) => ({ date: d.date, value: d.restingHeartRate ?? 0 }))}
              color="var(--color-move)"
              formatValue={(v) => `${Math.round(v)} bpm`}
            />
          </Panel>
        </motion.div>
      </div>
    </div>
  )
}

function Summary({
  label,
  value,
  sub,
  accent
}: {
  label: string
  value: string
  sub?: string
  accent: string
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5 px-5 py-4">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[24px] font-medium leading-none tracking-tight" style={{ color: accent }}>
          {value}
        </span>
        {sub && <span className="text-[12px] text-ink-dim">{sub}</span>}
      </div>
    </div>
  )
}

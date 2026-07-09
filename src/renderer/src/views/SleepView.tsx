import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Moon, Bed, Timer } from '@phosphor-icons/react'
import { Panel, SectionHeader } from '@/components/Panel'
import { SleepStages } from '@/components/SleepStages'
import { ProgressRing } from '@/components/ProgressRing'
import { formatMinutes, longDate } from '@/lib/format'
import type { SleepNight } from '@shared/types'

export function SleepView(): React.JSX.Element {
  const [nights, setNights] = useState<SleepNight[] | null>(null)

  useEffect(() => {
    let active = true
    window.pulse.health.sleep(14).then((data) => {
      if (active) setNights(data)
    })
    return () => {
      active = false
    }
  }, [])

  if (!nights) {
    return (
      <div className="mx-auto max-w-[1180px] animate-pulse px-8 pt-2">
        <div className="h-9 w-40 rounded-lg bg-white/5" />
        <div className="mt-5 h-80 rounded-[22px] bg-white/5" />
      </div>
    )
  }

  const latest = nights.at(-1)
  const history = [...nights].reverse()
  const avgAsleep = nights.reduce((s, n) => s + n.minutesAsleep, 0) / (nights.length || 1)

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-8 pb-12">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="pt-2"
      >
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">Sleep</h1>
        <p className="mt-1 text-[13px] text-ink-dim">{formatMinutes(avgAsleep)} average over {nights.length} nights.</p>
      </motion.header>

      {latest && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <Panel className="grid grid-cols-1 gap-8 p-7 lg:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center justify-center gap-3">
              <ProgressRing
                value={latest.minutesAsleep}
                color="var(--color-sleep-core)"
                trackColor="rgb(63 142 246 / 0.16)"
                size={132}
                strokeWidth={12}
              >
                <div className="text-center">
                  <div className="font-mono text-[19px] font-semibold leading-none text-ink">
                    {formatMinutes(latest.minutesAsleep)}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-ink-faint">asleep</div>
                </div>
              </ProgressRing>
              <div className="flex gap-4">
                <MiniStat icon={<Bed size={13} weight="fill" />} label="In bed" value={formatMinutes(latest.minutesInSleepPeriod)} />
                <MiniStat
                  icon={<Timer size={13} weight="fill" />}
                  label="Efficiency"
                  value={`${Math.round((latest.minutesAsleep / Math.max(1, latest.minutesInSleepPeriod)) * 100)}%`}
                />
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <SectionHeader
                title={longDate(latest.date)}
                hint="Last night’s stages"
                icon={<Moon size={18} weight="fill" className="text-sleep-core" />}
              />
              <div className="mt-5">
                <SleepStages night={latest} />
              </div>
            </div>
          </Panel>
        </motion.div>
      )}

      <div>
        <h2 className="mb-3 px-1 text-[13px] font-semibold text-ink-dim">Recent nights</h2>
        <div className="flex flex-col gap-2.5">
          {history.slice(1).map((night, i) => (
            <motion.div
              key={night.date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <NightRow night={night} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MiniStat({
  icon,
  label,
  value
}: {
  icon: React.ReactNode
  label: string
  value: string
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex items-center gap-1 text-[11px] text-ink-faint">
        <span className="text-ink-dim">{icon}</span>
        {label}
      </span>
      <span className="font-mono text-[13px] text-ink">{value}</span>
    </div>
  )
}

// Compact stacked stage bar for the history list.
function NightRow({ night }: { night: SleepNight }): React.JSX.Element {
  const order = ['DEEP', 'LIGHT', 'REM', 'AWAKE'] as const
  const colors: Record<string, string> = {
    DEEP: 'var(--color-sleep-deep)',
    LIGHT: 'var(--color-sleep-core)',
    REM: 'var(--color-sleep-rem)',
    AWAKE: 'var(--color-sleep-awake)'
  }
  const total = order.reduce((s, k) => s + (night.stageMinutes[k] ?? 0), 0) || 1

  return (
    <Panel className="flex items-center gap-4 px-5 py-3.5">
      <div className="w-28 shrink-0">
        <div className="text-[13px] font-medium text-ink">
          {new Date(`${night.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}
        </div>
        <div className="text-[11px] text-ink-faint">
          {new Date(`${night.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
        {order.map((k) => {
          const w = ((night.stageMinutes[k] ?? 0) / total) * 100
          return w > 0 ? <div key={k} style={{ width: `${w}%`, background: colors[k] }} /> : null
        })}
      </div>
      <div className="w-16 shrink-0 text-right font-mono text-[13px] text-ink">
        {formatMinutes(night.minutesAsleep)}
      </div>
    </Panel>
  )
}

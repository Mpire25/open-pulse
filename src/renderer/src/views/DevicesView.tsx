import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowClockwise,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  CaretDown,
  CheckCircle,
  Cloud,
  Heartbeat,
  Moon,
  PersonSimpleRun,
  Pulse,
  Scales,
  type Icon
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { Panel, SectionHeader } from '@/components/Panel'
import { CARD_HEIGHT, SkeletonBlock, SkeletonText } from '@/components/Skeleton'
import { useDevices, useSeries } from '@/hooks/useHealth'
import { METRICS } from '@/lib/metric-registry'
import { metricAbsent, rangeEnding, seriesPoints } from '@/lib/metrics'
import { isoToday, relativeTime } from '@/lib/format'
import { fade } from '@/lib/motion'
import type { MetricKey, PairedDevice } from '@shared/types'
import { cn } from '@/lib/utils'
import fitbitAir from '@/assets/fitbit-air.png'

// What the coverage panel checks, grouped the way a person thinks about it.
const COVERAGE: Array<{ label: string; icon: Icon; keys: MetricKey[] }> = [
  { label: 'Movement', icon: PersonSimpleRun, keys: ['steps', 'distanceKm', 'activeZoneMinutes', 'caloriesOut'] },
  { label: 'Heart', icon: Heartbeat, keys: ['restingHeartRate', 'hrvMs'] },
  { label: 'Sleep', icon: Moon, keys: ['sleepMinutes', 'sleepEfficiency'] },
  { label: 'Night signals', icon: Pulse, keys: ['spo2Pct', 'breathingRate', 'skinTempDeltaC'] },
  { label: 'Body & nutrition', icon: Scales, keys: ['weightKg', 'bodyFatPct', 'waterMl', 'caloriesIn'] }
]

const COVERAGE_KEYS = COVERAGE.flatMap((c) => c.keys)

interface DevicesViewProps {
  connected: boolean
}

export function DevicesView({ connected }: DevicesViewProps): React.JSX.Element {
  const devices = useDevices()
  const queryClient = useQueryClient()
  const today = isoToday()
  const { start, end } = rangeEnding(today, 7)
  const series = useSeries(COVERAGE_KEYS, start, end)

  const device = devices.data?.[0] ?? null

  return (
    <div className="mx-auto flex max-w-[1060px] flex-col gap-5 px-8 pb-12">
      <motion.header
        custom={0}
        variants={fade}
        initial="hidden"
        animate="show"
        className="flex items-end justify-between pt-2"
      >
        <div>
          <h1 className="display text-[27px] font-bold text-ink">Devices</h1>
          <p className="mt-1 text-[13px] text-ink-dim">Your tracker and what it’s delivering.</p>
        </div>
        <button
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['devices'] })}
          className="no-drag flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[12px] font-medium text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink"
        >
          <ArrowClockwise size={13} weight="bold" /> Refresh
        </button>
      </motion.header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.1fr_1fr]">
        {/* Product hero */}
        <motion.div custom={1} variants={fade} initial="hidden" animate="show" className="w-full">
          {devices.isPending ? (
            <Panel className={`flex flex-col overflow-hidden ${CARD_HEIGHT.device}`}>
              <div className="grid h-[184px] place-items-center px-6 pt-8">
                <SkeletonBlock className="h-36 w-24 rounded-[28px]" />
              </div>
              <div className="flex flex-1 flex-col gap-4 p-6 pt-3">
                <SkeletonText className="h-5 w-24 rounded-full" />
                <SkeletonBlock className="h-5 w-40" />
                <SkeletonText className="w-32" />
                <SkeletonBlock className="mt-2 h-2 w-full rounded-full" />
                <SkeletonText className="mt-auto w-28" />
              </div>
            </Panel>
          ) : device ? (
            <DeviceHero device={device} connected={connected} />
          ) : (
            <Panel className={`grid place-items-center p-12 text-[13px] text-ink-faint ${CARD_HEIGHT.device}`}>
              No paired devices found on this Google account.
            </Panel>
          )}
        </motion.div>

        {/* Data coverage */}
        <motion.div custom={2} variants={fade} initial="hidden" animate="show" className="h-[440px] w-full">
          <Panel className={`flex h-full flex-col p-6 ${CARD_HEIGHT.device}`}>
            <SectionHeader
              title="Data coverage"
              hint="What arrived over the last 7 days"
              icon={<Cloud size={18} weight="fill" className="text-ink-dim" />}
            />
            <div className="mt-4 flex flex-1 flex-col justify-between gap-1">
              {COVERAGE.map((row) => {
                const pending = row.keys.some((key) => series.isMetricPending(key))
                const available = row.keys.filter(
                  (key) => !metricAbsent(seriesPoints(series.data?.days, key, start, end))
                )
                const Icon = row.icon
                return (
                  <div key={row.label} className="flex items-center gap-3 border-b border-hairline py-3 last:border-0">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04]">
                      <Icon size={16} weight="fill" className="text-ink-dim" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink">{row.label}</div>
                      {pending ? (
                        <SkeletonText className="mt-1 w-32" />
                      ) : (
                        <div className="truncate text-[11.5px] text-ink-faint">
                          {available.length
                            ? available.map((key) => METRICS[key].shortLabel ?? METRICS[key].label).join(' · ')
                            : 'No data in this window'}
                        </div>
                      )}
                    </div>
                    {!pending && available.length > 0 && (
                      <CheckCircle size={17} weight="fill" style={{ color: 'var(--color-recovery)' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        </motion.div>
      </div>
    </div>
  )
}

function DeviceHero({ device, connected }: { device: PairedDevice; connected: boolean }): React.JSX.Element {
  return (
    <Panel className={`flex h-full flex-col overflow-hidden ${CARD_HEIGHT.device}`}>
      {/* Product visual on a soft radial wash */}
      <div
        className="relative grid place-items-center px-6 pb-2 pt-8"
        style={{
          background: 'radial-gradient(ellipse 65% 80% at 50% 45%, rgb(125 123 240 / 0.08), transparent 70%)'
        }}
      >
        <img
          src={fitbitAir}
          alt={device.model}
          className="h-44 w-auto scale-[1.4] object-contain"
          draggable={false}
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span
              className={cn(
                'mb-2 inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-[10.5px] font-semibold tracking-wide',
                connected ? 'text-recovery' : 'text-ink-dim'
              )}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: connected ? 'var(--color-recovery)' : 'var(--color-ink-faint)' }}
              />
              {connected ? 'Connected' : 'Sample device'}
            </span>
            <h2 className="text-[19px] font-semibold tracking-tight text-ink">{device.name}</h2>
            <p className="mt-0.5 text-[12px] text-ink-faint">
              {device.model}
              {device.type ? ` · ${titleCase(device.type)}` : ''}
            </p>
          </div>
          {device.lastSync && (
            <div className="text-right">
              <div className="text-[11px] text-ink-faint">Last sync</div>
              <div className="text-[13px] font-medium text-ink-dim">{relativeTime(device.lastSync)}</div>
            </div>
          )}
        </div>

        {device.batteryPct != null && <BatteryMeter pct={device.batteryPct} state={device.batteryState} />}

        {device.features && device.features.length > 0 && <Capabilities features={device.features} />}
      </div>
    </Panel>
  )
}

function BatteryMeter({ pct, state }: { pct: number; state?: string | null }): React.JSX.Element {
  // Severity by charge level; the track is a lighter step of the same hue.
  const color = pct > 50 ? 'var(--color-recovery)' : pct > 20 ? 'var(--color-activity)' : 'var(--color-danger)'
  const Icon = pct > 50 ? BatteryFull : pct > 20 ? BatteryMedium : BatteryLow
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-ink-faint">
          <Icon size={15} weight="fill" style={{ color }} />
          Battery{state ? ` · ${titleCase(state)}` : ''}
        </span>
        <span className="text-[13px] font-semibold text-ink">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

// The API reports 50+ internal capability flags. They're debug output, not
// product truth — so they live behind a disclosure instead of a chip wall.
function Capabilities({ features }: { features: string[] }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-auto border-t border-hairline pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-[12px] font-medium text-ink-dim transition-colors hover:text-ink"
      >
        All capabilities ({features.length})
        <CaretDown size={12} weight="bold" className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pr-1">
          {features.map((f) => (
            <span
              key={f}
              className="rounded-full border border-hairline bg-white/[0.03] px-2.5 py-1 text-[10.5px] font-medium tracking-wide text-ink-dim"
            >
              {titleCase(f)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function titleCase(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

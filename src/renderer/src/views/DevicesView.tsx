import { motion } from 'framer-motion'
import { ArrowClockwise, BatteryFull, BatteryLow, BatteryMedium, Watch } from '@phosphor-icons/react'
import { Panel } from '@/components/Panel'
import { useDevices } from '@/hooks/useHealth'
import { relativeTime } from '@/lib/format'
import type { PairedDevice } from '@shared/types'

const fade = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.04 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] as const }
  })
}

export function DevicesView(): React.JSX.Element {
  const { devices, refresh } = useDevices()

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5 px-8 pb-12">
      <motion.header
        custom={0}
        variants={fade}
        initial="hidden"
        animate="show"
        className="flex items-end justify-between pt-2"
      >
        <div>
          <h1 className="display text-[27px] font-bold text-ink">Devices</h1>
          <p className="mt-1 text-[13px] text-ink-dim">Paired trackers and their sync state.</p>
        </div>
        <button
          onClick={refresh}
          className="no-drag flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-3 text-[12px] font-medium text-ink-dim transition-colors hover:bg-white/[0.05] hover:text-ink"
        >
          <ArrowClockwise size={13} weight="bold" /> Refresh
        </button>
      </motion.header>

      {devices == null ? (
        <div className="h-40 animate-pulse rounded-[22px] bg-white/5" />
      ) : devices.length === 0 ? (
        <Panel className="grid place-items-center p-12 text-[13px] text-ink-faint">
          No paired devices found on this Google account.
        </Panel>
      ) : (
        devices.map((d, i) => (
          <motion.div key={`${d.name}-${i}`} custom={i + 1} variants={fade} initial="hidden" animate="show">
            <DeviceCard device={d} />
          </motion.div>
        ))
      )}
    </div>
  )
}

function DeviceCard({ device }: { device: PairedDevice }): React.JSX.Element {
  return (
    <Panel className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-hairline bg-white/[0.04]">
            <Watch size={24} weight="fill" className="text-ink-dim" />
          </div>
          <div>
            <h3 className="text-[16px] font-semibold tracking-tight text-ink">{device.name}</h3>
            <p className="mt-0.5 text-[12px] text-ink-faint">
              {device.model}
              {device.type ? ` · ${titleCase(device.type)}` : ''}
            </p>
          </div>
        </div>
        {device.lastSync && (
          <div className="text-right">
            <div className="text-[11px] text-ink-faint">Last sync</div>
            <div className="text-[13px] font-medium text-ink-dim">{relativeTime(device.lastSync)}</div>
          </div>
        )}
      </div>

      {device.batteryPct != null && <BatteryMeter pct={device.batteryPct} state={device.batteryState} />}

      {device.features && device.features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {device.features.map((f) => (
            <span
              key={f}
              className="rounded-full border border-hairline bg-white/[0.03] px-2.5 py-1 text-[10.5px] font-medium tracking-wide text-ink-dim"
            >
              {titleCase(f)}
            </span>
          ))}
        </div>
      )}
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
        <span className="text-[13px] font-semibold text-ink">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)` }}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function titleCase(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

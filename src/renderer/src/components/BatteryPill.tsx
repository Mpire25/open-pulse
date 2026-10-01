import { BatteryIcon, clampBatteryPct } from '@/components/BatteryIcon'
import { useDevices } from '@/hooks/useHealth'

export function BatteryPill({ enabled, onClick }: { enabled: boolean; onClick?: () => void }): React.JSX.Element | null {
  const { data: devices } = useDevices(enabled)
  const device = devices?.find((d) => d.batteryPct != null)
  if (!device || device.batteryPct == null) return null
  const pct = Math.round(clampBatteryPct(device.batteryPct))
  const meter = (
    <div
      className="no-drag flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-semibold text-ink-dim"
      role="meter"
      aria-label={`${device.name} battery level`}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      title={`${device.name} · ${pct}%`}
    >
      <BatteryIcon pct={pct} size={17} />
      {pct}%
    </div>
  )
  return onClick ? (
    <button onClick={onClick} aria-label={`${device.name} battery ${pct}%. Open devices`} className="rounded-lg transition-colors hover:bg-white/[0.06]">
      {meter}
    </button>
  ) : meter
}

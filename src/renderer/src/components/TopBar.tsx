// Title-bar strip: draggable, hosting (right-aligned, openfit-style) the date
// control, device battery, assistant toggle, and refresh with live progress.

import { ArrowClockwise, BatteryFull, BatteryLow, BatteryMedium, Sparkle } from '@phosphor-icons/react'
import { DateNav } from '@/components/DateNav'
import { useDevices, useRefresh, useSyncBusy } from '@/hooks/useHealth'
import { cn } from '@/lib/utils'

interface TopBarProps {
  showDateNav: boolean
  date: string
  onDateChange: (date: string) => void
  showAsk: boolean
  chatOpen: boolean
  onToggleChat: () => void
}

export function TopBar({
  showDateNav,
  date,
  onDateChange,
  showAsk,
  chatOpen,
  onToggleChat
}: TopBarProps): React.JSX.Element {
  return (
    <div className="drag-region relative z-30 flex h-11 shrink-0 items-center justify-end gap-2 px-3">
      {showDateNav && <DateNav date={date} onChange={onDateChange} />}

      <BatteryPill />

      {showAsk && (
        <button
          onClick={onToggleChat}
          aria-label="Toggle assistant"
          className={cn(
            'no-drag flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors',
            chatOpen ? 'bg-accent-soft text-accent' : 'text-ink-dim hover:bg-white/[0.06] hover:text-ink'
          )}
        >
          <Sparkle size={14} weight="fill" />
          Ask
        </button>
      )}

      <RefreshButton />
    </div>
  )
}

function BatteryPill(): React.JSX.Element | null {
  const { data: devices } = useDevices()
  const device = devices?.find((d) => d.batteryPct != null)
  if (!device || device.batteryPct == null) return null
  const pct = Math.max(0, Math.min(100, Math.round(device.batteryPct)))
  const color = pct > 50 ? 'var(--color-recovery)' : pct > 20 ? 'var(--color-activity)' : 'var(--color-danger)'
  const Icon = pct > 50 ? BatteryFull : pct > 20 ? BatteryMedium : BatteryLow
  return (
    <div
      className="no-drag flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-semibold text-ink-dim"
      role="status"
      aria-label={`${device.name} battery ${pct}%`}
      title={`${device.name} · ${pct}%`}
    >
      <Icon size={16} weight="fill" style={{ color }} />
      {pct}%
    </div>
  )
}

function RefreshButton(): React.JSX.Element {
  const refresh = useRefresh()
  const busy = useSyncBusy()
  return (
    <button
      onClick={() => void refresh()}
      disabled={busy}
      aria-label={busy ? 'Syncing…' : 'Refresh data'}
      title={busy ? 'Syncing…' : 'Refresh data'}
      className={cn(
        'no-drag grid h-7 w-7 place-items-center rounded-lg transition-colors',
        busy ? 'text-accent' : 'text-ink-dim hover:bg-white/[0.06] hover:text-ink'
      )}
    >
      <ArrowClockwise size={15} weight="bold" className={cn(busy && 'animate-spin')} />
    </button>
  )
}

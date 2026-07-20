// Title-bar strip: draggable, hosting (right-aligned, openfit-style) the date
// control, device battery, assistant toggle, and refresh with live progress.

import { ArrowClockwise, SidebarSimple, Sparkle } from '@phosphor-icons/react'
import { BatteryIcon, clampBatteryPct } from '@/components/BatteryIcon'
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
  sidebarOpen: boolean
  onToggleSidebar: () => void
  connected: boolean
}

export function TopBar({
  showDateNav,
  date,
  onDateChange,
  showAsk,
  chatOpen,
  onToggleChat,
  sidebarOpen,
  onToggleSidebar,
  connected
}: TopBarProps): React.JSX.Element {
  return (
    <div className="drag-region relative z-30 flex h-11 shrink-0 items-center justify-end gap-2 px-3">
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        className="no-drag fixed left-24 top-3 grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <SidebarSimple size={16} weight="bold" />
      </button>

      {showDateNav && <DateNav date={date} onChange={onDateChange} />}

      <BatteryPill enabled={connected} />

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

function BatteryPill({ enabled }: { enabled: boolean }): React.JSX.Element | null {
  const { data: devices } = useDevices(enabled)
  const device = devices?.find((d) => d.batteryPct != null)
  if (!device || device.batteryPct == null) return null
  const pct = Math.round(clampBatteryPct(device.batteryPct))
  return (
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

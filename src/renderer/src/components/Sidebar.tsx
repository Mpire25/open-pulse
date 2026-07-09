import { motion } from 'framer-motion'
import {
  ChartLineUp,
  Heartbeat,
  Moon,
  Sparkle,
  GearSix,
  type Icon
} from '@phosphor-icons/react'
import { AppLogo } from '@/components/AppLogo'
import { cn } from '@/lib/utils'

export type View = 'today' | 'trends' | 'sleep' | 'assistant' | 'settings'

const NAV: { id: View; label: string; icon: Icon }[] = [
  { id: 'today', label: 'Today', icon: Heartbeat },
  { id: 'trends', label: 'Trends', icon: ChartLineUp },
  { id: 'sleep', label: 'Sleep', icon: Moon },
  { id: 'assistant', label: 'Assistant', icon: Sparkle }
]

interface SidebarProps {
  view: View
  onSelect: (view: View) => void
  demoMode: boolean
}

export function Sidebar({ view, onSelect, demoMode }: SidebarProps): React.JSX.Element {
  return (
    <nav className="drag-region flex w-[212px] shrink-0 flex-col px-3 pb-4 pt-[54px]">
      <div className="no-drag mb-6 flex items-center gap-2.5 px-2">
        <AppLogo size={28} />
        <span className="text-[17px] font-semibold tracking-tight">OpenPulse</span>
      </div>

      <div className="no-drag flex flex-col gap-0.5">
        {NAV.map((item) => (
          <NavButton key={item.id} item={item} active={view === item.id} onSelect={onSelect} />
        ))}
      </div>

      <div className="no-drag mt-auto flex flex-col gap-0.5">
        {demoMode && (
          <div className="mb-2 mx-1 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2.5">
            <p className="text-[11px] font-medium text-ink-dim">Sample data</p>
            <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
              Connect your Fitbit Air in Settings to see live metrics.
            </p>
          </div>
        )}
        <NavButton
          item={{ id: 'settings', label: 'Settings', icon: GearSix }}
          active={view === 'settings'}
          onSelect={onSelect}
        />
      </div>
    </nav>
  )
}

function NavButton({
  item,
  active,
  onSelect
}: {
  item: { id: View; label: string; icon: Icon }
  active: boolean
  onSelect: (view: View) => void
}): React.JSX.Element {
  const Icon = item.icon
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        'relative flex items-center gap-2.5 rounded-[11px] px-3 py-2 text-[13px] font-medium transition-colors duration-150',
        active ? 'text-ink' : 'text-ink-dim hover:text-ink'
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-[11px] border border-hairline bg-white/[0.07]"
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <Icon size={17} weight={active ? 'fill' : 'regular'} className="relative z-10" />
      <span className="relative z-10">{item.label}</span>
    </button>
  )
}

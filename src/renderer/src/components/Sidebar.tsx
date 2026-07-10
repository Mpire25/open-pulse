import { motion } from 'framer-motion'
import {
  SquaresFour,
  PersonSimpleRun,
  Heartbeat,
  Moon,
  Scales,
  ForkKnife,
  Watch,
  Sparkle,
  GearSix,
  type Icon
} from '@phosphor-icons/react'
import { AppLogo } from '@/components/AppLogo'
import { cn } from '@/lib/utils'

export type View =
  | 'home'
  | 'activity'
  | 'heart'
  | 'sleep'
  | 'body'
  | 'nutrition'
  | 'devices'
  | 'assistant'
  | 'settings'

interface NavItem {
  id: View
  label: string
  icon: Icon
}

// The wellbeing pages people live in…
const WELLBEING: NavItem[] = [
  { id: 'home', label: 'Home', icon: SquaresFour },
  { id: 'activity', label: 'Activity', icon: PersonSimpleRun },
  { id: 'heart', label: 'Heart', icon: Heartbeat },
  { id: 'sleep', label: 'Sleep', icon: Moon },
  { id: 'body', label: 'Body', icon: Scales },
  { id: 'nutrition', label: 'Nutrition', icon: ForkKnife }
]

// …and the management pages that only matter occasionally live at the bottom.
const MANAGEMENT: NavItem[] = [
  { id: 'devices', label: 'Devices', icon: Watch },
  { id: 'assistant', label: 'Assistant', icon: Sparkle },
  { id: 'settings', label: 'Settings', icon: GearSix }
]

interface SidebarProps {
  view: View
  onSelect: (view: View) => void
  connected: boolean
}

export function Sidebar({ view, onSelect, connected }: SidebarProps): React.JSX.Element {
  return (
    <motion.nav
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 204, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="drag-region shrink-0 overflow-hidden"
    >
      <div className="flex h-full w-[204px] flex-col px-3 pb-4 pt-[54px]">
        <div className="no-drag mb-6 flex w-[180px] items-center gap-2.5 px-2">
          <AppLogo size={28} />
          <span className="display text-[16px] font-bold">OpenPulse</span>
        </div>

        <div className="no-drag flex w-[180px] flex-col gap-0.5">
          {WELLBEING.map((item) => (
            <NavButton key={item.id} item={item} active={view === item.id} onSelect={onSelect} />
          ))}
        </div>

        <div className="no-drag mt-auto flex w-[180px] flex-col gap-0.5">
          {!connected && (
            <div className="mb-2 mx-1 rounded-xl border border-hairline bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-activity" />
                <p className="text-[11px] font-medium text-ink-dim">Sample data</p>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-ink-faint">
                Connect your Fitbit Air to see your own metrics.
              </p>
            </div>
          )}
          <div className="mx-2 mb-2 h-px bg-hairline" />
          {MANAGEMENT.map((item) => (
            <NavButton key={item.id} item={item} active={view === item.id} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </motion.nav>
  )
}

function NavButton({
  item,
  active,
  onSelect
}: {
  item: NavItem
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

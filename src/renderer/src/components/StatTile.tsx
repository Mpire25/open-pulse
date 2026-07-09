import type { Icon } from '@phosphor-icons/react'

interface StatTileProps {
  icon: Icon
  label: string
  value: string
  unit?: string
  accent: string
  sub?: string
}

// Compact metric readout: 1px-separated, no heavy card, mono numerals.
export function StatTile({ icon: Icon, label, value, unit, accent, sub }: StatTileProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <Icon size={14} weight="fill" style={{ color: accent }} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-[22px] font-medium leading-none tracking-tight text-ink">
          {value}
        </span>
        {unit && <span className="text-[12px] text-ink-dim">{unit}</span>}
      </div>
      {sub && <span className="text-[11px] text-ink-faint">{sub}</span>}
    </div>
  )
}

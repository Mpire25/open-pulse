import type { Icon } from '@phosphor-icons/react'
import { ArrowDownRight, ArrowUpRight } from '@phosphor-icons/react'
import { Spark } from '@/components/charts'
import { cn } from '@/lib/utils'

interface MetricStatProps {
  icon?: Icon
  label: string
  value: string
  unit?: string
  accent: string
  /** Signed % vs the personal baseline; direction colors follow `upIsGood`. */
  deltaPct?: number | null
  upIsGood?: boolean
  /** 14-day history for the corner sparkline. */
  spark?: Array<number | null>
  sub?: string
}

/** Stat tile: label, sans-semibold value, optional baseline delta + sparkline. */
export function MetricStat({
  icon: IconCmp,
  label,
  value,
  unit,
  accent,
  deltaPct,
  upIsGood = true,
  spark,
  sub
}: MetricStatProps): React.JSX.Element {
  const showDelta = deltaPct != null && Math.abs(deltaPct) >= 1
  const good = deltaPct != null && (deltaPct > 0 ? upIsGood : !upIsGood)
  return (
    <div className="flex flex-col gap-2 px-5 py-4">
      <div className="flex items-center gap-1.5">
        {IconCmp && <IconCmp size={13} weight="fill" style={{ color: accent }} />}
        <span className="text-[11px] font-medium tracking-wide text-ink-faint">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-[24px] font-semibold leading-none tracking-tight text-ink">{value}</span>
          {unit && <span className="text-[11.5px] text-ink-dim">{unit}</span>}
        </div>
        {spark && <Spark values={spark} color={accent} />}
      </div>
      {(showDelta || sub) && (
        <div className="flex items-center gap-1.5 text-[11px] leading-none">
          {showDelta && (
            <span
              className={cn(
                'flex items-center gap-0.5 font-semibold',
                good ? 'text-recovery' : 'text-heart'
              )}
            >
              {deltaPct! > 0 ? <ArrowUpRight size={11} weight="bold" /> : <ArrowDownRight size={11} weight="bold" />}
              {Math.abs(deltaPct!).toFixed(0)}%
            </span>
          )}
          <span className="text-ink-faint">{sub ?? 'vs 7-day baseline'}</span>
        </div>
      )}
    </div>
  )
}

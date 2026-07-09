import type { Icon } from '@phosphor-icons/react'
import { CaretRight } from '@phosphor-icons/react'
import { Spark } from '@/components/charts'
import { DeltaChip } from '@/components/DeltaChip'
import { cn } from '@/lib/utils'

interface MetricStatProps {
  icon?: Icon
  label: string
  value: string
  unit?: string
  accent: string
  /** Signed % vs the personal baseline; colored by `upIsGood`. */
  deltaPct?: number | null
  upIsGood?: boolean | null
  /** Recent history for the corner sparkline. */
  spark?: Array<number | null>
  sub?: string
  /** When set, the tile is a button that opens the metric's detail page. */
  onOpen?: () => void
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
  sub,
  onOpen
}: MetricStatProps): React.JSX.Element {
  const body = (
    <>
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {IconCmp && <IconCmp size={13} weight="fill" style={{ color: accent }} />}
          <span className="text-[11px] font-medium tracking-wide text-ink-faint">{label}</span>
        </div>
        {onOpen && (
          <CaretRight
            size={11}
            weight="bold"
            className="text-ink-faint opacity-0 transition-opacity group-hover/stat:opacity-100"
          />
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <span className="text-[24px] font-semibold leading-none tracking-tight text-ink">{value}</span>
          {unit && <span className="text-[11.5px] text-ink-dim">{unit}</span>}
        </div>
        {spark && <Spark values={spark} color={accent} />}
      </div>
      {(deltaPct != null || sub) && (
        <div className="flex items-center gap-1.5 text-[11px] leading-none">
          <DeltaChip delta={deltaPct ?? null} upIsGood={upIsGood} />
          <span className="text-ink-faint">{sub ?? 'vs 7-day baseline'}</span>
        </div>
      )}
    </>
  )

  if (onOpen) {
    return (
      <button
        onClick={onOpen}
        className="group/stat flex flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        {body}
      </button>
    )
  }
  return <div className="flex flex-col gap-2 px-5 py-4">{body}</div>
}

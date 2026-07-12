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
  /** Signed difference vs the relevant baseline; colored by `upIsGood`. */
  delta?: number | null
  deltaFormat?: (magnitude: number) => string
  deltaMinMagnitude?: number
  showTypicalDelta?: boolean
  upIsGood?: boolean | null
  /** Recent history for the corner sparkline. */
  spark?: Array<number | null>
  sparkWidth?: number
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
  delta,
  deltaFormat,
  deltaMinMagnitude,
  showTypicalDelta = false,
  upIsGood = true,
  spark,
  sparkWidth = 72,
  sub,
  onOpen
}: MetricStatProps): React.JSX.Element {
  const body = (
    <>
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {IconCmp && <IconCmp size={13} weight="fill" style={{ color: accent }} />}
          <span className="truncate text-[11px] font-medium tracking-wide text-ink-faint">{label}</span>
        </div>
        {onOpen && (
          <CaretRight
            size={11}
            weight="bold"
            className="text-ink-faint opacity-0 transition-opacity group-hover/stat:opacity-100"
          />
        )}
      </div>
      <div className="flex min-w-0 items-end gap-2 overflow-hidden">
        <div className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
          <span className="text-[24px] font-semibold leading-none tracking-tight text-ink">{value}</span>
          {unit && <span className="shrink-0 text-[11.5px] text-ink-dim">{unit}</span>}
        </div>
        {spark && (
          <div className="flex min-w-0 flex-1 justify-end overflow-hidden">
            <Spark values={spark} color={accent} width={sparkWidth} />
          </div>
        )}
      </div>
      {(delta != null || sub) && (
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] leading-none">
          <DeltaChip
            delta={delta ?? null}
            upIsGood={upIsGood}
            format={deltaFormat}
            minMagnitude={deltaMinMagnitude}
            showTypical={showTypicalDelta}
          />
          <span className="min-w-0 leading-tight text-ink-faint">{sub ?? 'vs 7-day baseline'}</span>
        </div>
      )}
    </>
  )

  if (onOpen) {
    return (
      <button
        onClick={onOpen}
        className="group/stat flex w-full min-w-0 overflow-hidden flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        {body}
      </button>
    )
  }
  return <div className="flex w-full min-w-0 overflow-hidden flex-col gap-2 px-5 py-4">{body}</div>
}

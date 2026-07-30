import type { Icon } from '@phosphor-icons/react'
import { CaretRight } from '@phosphor-icons/react'
import { Spark } from '@/components/charts'
import { DeltaChip } from '@/components/DeltaChip'
import { SkeletonBlock } from '@/components/Skeleton'
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
  sparkWidth?: number
  sub?: string
  /** When set, the tile is a button that opens the metric's detail page. */
  onOpen?: () => void
  loading?: boolean
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
  sparkWidth = 72,
  sub,
  onOpen,
  loading = false
}: MetricStatProps): React.JSX.Element {
  const body = (
    <>
      <div className="flex min-h-[13px] min-w-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {loading ? (
            <>
              <SkeletonBlock className="h-3 w-3 rounded-full" />
              <SkeletonBlock className="h-2.5 w-16" />
            </>
          ) : (
            <>
              {IconCmp && <IconCmp size={13} weight="fill" style={{ color: accent }} />}
              <span className="truncate text-[11px] font-medium tracking-wide text-ink-faint">{label}</span>
            </>
          )}
        </div>
        {onOpen && !loading && (
          <CaretRight
            size={11}
            weight="bold"
            className="text-ink-faint opacity-0 transition-opacity group-hover/stat:opacity-100"
          />
        )}
      </div>
      <div className="flex min-h-6 min-w-0 items-end gap-2 overflow-hidden">
        {loading ? (
          <>
            <SkeletonBlock className="h-6 w-20 shrink-0" />
            <div className="flex min-w-0 flex-1 justify-end overflow-hidden">
              <SkeletonBlock className="h-6 min-w-0 max-w-[55%] shrink" style={{ width: sparkWidth }} />
            </div>
          </>
        ) : (
          <>
            <div className="flex shrink-0 items-baseline gap-1 whitespace-nowrap">
              <span className="text-[24px] font-semibold leading-none tracking-tight text-ink">{value}</span>
              {unit && <span className="shrink-0 text-[11.5px] text-ink-dim">{unit}</span>}
            </div>
            {spark && (
              <div className="flex min-w-0 flex-1 justify-end overflow-hidden">
                <Spark values={spark} color={accent} width={sparkWidth} />
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex min-h-4 min-w-0 items-center gap-1.5 text-[11px] leading-none">
        {loading ? (
          <>
            <SkeletonBlock className="h-4 w-10 rounded-full" />
            <SkeletonBlock className="h-2.5 w-20" />
          </>
        ) : (
          (deltaPct != null || sub) && (
            <>
              <DeltaChip delta={deltaPct ?? null} upIsGood={upIsGood} />
              <span className="min-w-0 leading-tight text-ink-faint">{sub ?? 'vs 7-day baseline'}</span>
            </>
          )
        )}
      </div>
    </>
  )

  if (onOpen) {
    return (
      <button
        onClick={loading ? undefined : onOpen}
        disabled={loading}
        aria-busy={loading}
        className="group/stat flex min-h-[107px] w-full min-w-0 overflow-hidden flex-col gap-2 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        {body}
      </button>
    )
  }
  return (
    <div
      aria-busy={loading}
      className="flex min-h-[107px] w-full min-w-0 overflow-hidden flex-col gap-2 px-5 py-4"
    >
      {body}
    </div>
  )
}

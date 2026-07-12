import { Minus, TrendDown, TrendUp } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

interface DeltaChipProps {
  /** Signed delta. Percent by default; pass `abs` formatting via `format`. */
  delta: number | null
  /** null = neutral metric: shown gray, never judged. */
  upIsGood: boolean | null
  /** Formats the magnitude; default renders "12%". */
  format?: (magnitude: number) => string
  /** Hide chips for deltas smaller than this magnitude. */
  minMagnitude?: number
  /** Show a neutral status instead of hiding a valid sub-threshold delta. */
  showTypical?: boolean
  className?: string
}

/**
 * Colored baseline delta: green when the direction is good for this metric,
 * red when it's bad, gray when the metric has no direction semantics.
 */
export function DeltaChip({
  delta,
  upIsGood,
  format = (m) => `${m.toFixed(0)}%`,
  minMagnitude = 1,
  showTypical = false,
  className
}: DeltaChipProps): React.JSX.Element | null {
  if (delta == null) return null
  if (Math.abs(delta) < minMagnitude) {
    if (!showTypical) return null
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-ink-dim',
          className
        )}
      >
        <Minus size={11} weight="bold" />
        Typical
      </span>
    )
  }
  const good = upIsGood == null ? null : delta > 0 ? upIsGood : !upIsGood
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold leading-none',
        good == null && 'bg-white/[0.06] text-ink-dim',
        good === true && 'bg-recovery-soft text-recovery',
        good === false && 'bg-heart-soft text-heart',
        className
      )}
    >
      {delta > 0 ? <TrendUp size={11} weight="bold" /> : <TrendDown size={11} weight="bold" />}
      {format(Math.abs(delta))}
    </span>
  )
}

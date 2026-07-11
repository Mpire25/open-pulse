import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared panel geometry. Loaded cards and their loading states use the same
 * token so switching dates never causes the surrounding grid to jump.
 */
export const CARD_HEIGHT = {
  periodStats: 'min-h-[92px]',
  compact: 'min-h-28',
  summary: 'min-h-40',
  hero: 'min-h-56',
  chart: 'min-h-[250px]',
  large: 'min-h-[286px]',
  detail: 'min-h-[298px]',
  detailLarge: 'min-h-[312px]',
  device: 'min-h-[440px]'
} as const

const pulse = 'animate-pulse bg-white/[0.055]'

export function SkeletonBlock({ className, ...props }: HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return <span aria-hidden className={cn('block rounded-md', pulse, className)} {...props} />
}

export function SkeletonText({ className }: { className?: string }): React.JSX.Element {
  return <SkeletonBlock className={cn('h-3 w-20', className)} />
}

export function SkeletonRing({
  size = 128,
  stroke = 11,
  className,
  contentClassName
}: {
  size?: number
  stroke?: number
  className?: string
  contentClassName?: string
}): React.JSX.Element {
  const radius = (size - stroke) / 2
  return (
    <div
      aria-hidden
      className={cn('relative grid shrink-0 animate-pulse place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(255 255 255 / 0.055)"
          strokeWidth={stroke}
        />
      </svg>
      <div className={cn('relative flex flex-col items-center gap-2', contentClassName)}>
        <SkeletonBlock className="h-5 w-14" />
        <SkeletonBlock className="h-2.5 w-12" />
      </div>
    </div>
  )
}

export function SkeletonChart({
  height = 170,
  columns = 7
}: {
  height?: number
  columns?: number
}): React.JSX.Element {
  const heights = [28, 48, 36, 68, 44, 78, 58, 34, 64, 42, 72, 52]
  return (
    <div aria-hidden className="relative w-full overflow-hidden" style={{ height }}>
      {[22, 55, 88].map((top) => (
        <span key={top} className="absolute left-0 right-8 h-px bg-hairline" style={{ top: `${top}%` }} />
      ))}
      <div className="absolute inset-x-0 bottom-[18px] top-3 flex items-end gap-2 pr-9">
        {Array.from({ length: columns }, (_, index) => (
          <SkeletonBlock
            key={index}
            className="min-w-1 flex-1 rounded-t-[5px] rounded-b-none"
            style={{ height: `${heights[index % heights.length]}%` } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-between pr-9">
        {Array.from({ length: Math.min(columns, 7) }, (_, index) => (
          <SkeletonBlock key={index} className="h-2 w-2" />
        ))}
      </div>
    </div>
  )
}

export function SkeletonMetricStat({ sparkWidth = 72 }: { sparkWidth?: number }): React.JSX.Element {
  return (
    <div className="flex min-h-28 flex-col gap-2 px-5 py-4" aria-hidden>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-3 w-3 rounded-full" />
        <SkeletonBlock className="h-2.5 w-16" />
      </div>
      <div className="flex items-end justify-between gap-2">
        <SkeletonBlock className="h-6 w-20" />
        <SkeletonBlock className="h-6 min-w-0 max-w-[55%] shrink" style={{ width: sparkWidth }} />
      </div>
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-4 w-10 rounded-full" />
        <SkeletonBlock className="h-2.5 w-20" />
      </div>
    </div>
  )
}

export function SkeletonRows({ rows = 2 }: { rows?: number }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center justify-between rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-9 w-9 rounded-xl" />
            <div className="flex flex-col gap-2">
              <SkeletonBlock className="h-3.5 w-28" />
              <SkeletonBlock className="h-2.5 w-20" />
            </div>
          </div>
          <div className="flex gap-4">
            <SkeletonBlock className="h-3 w-12" />
            <SkeletonBlock className="h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonSleepStages(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: 4 }, (_, row) => (
        <div key={row} className="flex items-center gap-3">
          <SkeletonBlock className="h-2.5 w-10" />
          <div className="relative h-[22px] flex-1 overflow-hidden rounded-full bg-white/[0.025]">
            <SkeletonBlock
              className="absolute inset-y-0 rounded-[5px]"
              style={{ left: `${8 + row * 12}%`, width: `${24 + (row % 2) * 18}%` } as React.CSSProperties}
            />
          </div>
        </div>
      ))}
      <div className="ml-[52px] flex justify-between">
        <SkeletonBlock className="h-2.5 w-12" />
        <SkeletonBlock className="h-2.5 w-12" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <SkeletonBlock className="h-2.5 w-12" />
            <SkeletonBlock className="h-3.5 w-10" />
          </div>
        ))}
      </div>
    </div>
  )
}

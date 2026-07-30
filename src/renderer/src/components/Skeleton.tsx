import type { HTMLAttributes } from 'react'
import { CHART_PLOT, chartColumnMaxWidth } from '@/lib/layout-contracts'
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
  device: 'min-h-[440px]',
  list: 'min-h-[232px]',
  measurementList: 'min-h-[268px]'
} as const

const pulse = 'animate-pulse bg-white/[0.055]'

const PERIOD_LINE_Y = [72, 62, 67, 42, 50, 31, 46, 25, 36]

function skeletonLinePath(values: number[]): string {
  return values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 100
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${value}`
    })
    .join(' ')
}

const PERIOD_LINE_PATH = skeletonLinePath(PERIOD_LINE_Y)
const INTRADAY_LINE_PATH =
  'M 0 50 H 42 L 44 50 L 45.5 18 L 47.5 84 L 49.5 36 L 51 61 L 53 50 H 55.5 L 57 50 L 58.5 24 L 60.5 72 L 62 43 L 63.5 65 L 65 41 L 66.5 50 H 100'

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
      <div className={cn('absolute inset-0 flex flex-col items-center justify-center gap-[6%]', contentClassName)}>
        <SkeletonBlock className="h-[12%] w-[44%]" />
        <SkeletonBlock className="h-[6%] w-[38%]" />
      </div>
    </div>
  )
}

export function SkeletonChart({
  height = 170,
  columns = 7,
  variant = 'bar',
  tickEvery,
  tickWidth
}: {
  height?: number
  columns?: number
  variant?: 'bar' | 'line' | 'intraday-line'
  tickEvery?: number
  tickWidth?: number
}): React.JSX.Element {
  const heights = [28, 48, 36, 68, 44, 78, 58, 34, 64, 42, 72, 52]
  const plotTop = CHART_PLOT.top
  const plotBottom = CHART_PLOT.bottom
  const axisGutter = CHART_PLOT.right
  const plotHeight = height - plotTop - plotBottom
  const isIntradayLine = variant === 'intraday-line'
  const defaultTickCount = Math.min(columns, 7)
  const tickPositions = isIntradayLine
    ? [25, 50, 75]
    : tickEvery != null
      ? Array.from(
          { length: Math.ceil(columns / tickEvery) },
          (_, index) => ((index * tickEvery + 0.5) / columns) * 100
        )
      : Array.from({ length: defaultTickCount }, (_, index) => {
          const columnIndex =
            defaultTickCount <= 1 ? 0 : Math.round((index / (defaultTickCount - 1)) * (columns - 1))
          return ((columnIndex + 0.5) / columns) * 100
        })
  const resolvedTickWidth = tickWidth ?? (isIntradayLine ? 40 : 8)
  const linePath = isIntradayLine ? INTRADAY_LINE_PATH : PERIOD_LINE_PATH
  const lineEndY = PERIOD_LINE_Y[PERIOD_LINE_Y.length - 1]
  return (
    <div aria-hidden className="relative w-full overflow-hidden" style={{ height }}>
      {[plotTop, plotTop + plotHeight / 2, plotTop + plotHeight].map((top) => (
        <span
          key={top}
          className="absolute left-0 h-px bg-hairline"
          style={{ top, right: axisGutter }}
        />
      ))}
      {variant === 'bar' ? (
        <div
          className="absolute grid"
          style={{
            left: 0,
            right: axisGutter,
            top: plotTop,
            bottom: plotBottom,
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
          }}
        >
          {Array.from({ length: columns }, (_, index) => (
            <span key={index} className="flex min-w-0 items-end justify-center px-px">
              <SkeletonBlock
                className="w-full min-w-[3px] rounded-t-[5px] rounded-b-none"
                style={{
                  height: `${heights[index % heights.length]}%`,
                  maxWidth: chartColumnMaxWidth(columns)
                }}
              />
            </span>
          ))}
        </div>
      ) : (
        <div
          className="absolute"
          style={{ left: 0, right: axisGutter, top: plotTop, bottom: plotBottom }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="h-full w-full animate-pulse overflow-visible"
            aria-hidden
          >
            <path
              d={linePath}
              fill="none"
              stroke="rgb(255 255 255 / 0.09)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {!isIntradayLine && (
            <SkeletonBlock
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: '100%', top: `${lineEndY}%` }}
            />
          )}
        </div>
      )}
      <div className="absolute bottom-0 left-0 h-2" style={{ right: axisGutter }}>
        {tickPositions.map((position) => (
          <SkeletonBlock
            key={position}
            className="absolute top-0 h-2 -translate-x-1/2"
            style={{
              left: `${position}%`,
              width: resolvedTickWidth
            }}
          />
        ))}
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

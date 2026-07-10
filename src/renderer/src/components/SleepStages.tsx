import { useMemo, useState } from 'react'
import type { SleepNight, SleepStageType } from '@shared/types'
import { formatClock, formatMinutes } from '@/lib/format'

export const STAGE_COLOR: Record<SleepStageType, string> = {
  AWAKE: 'var(--color-stage-awake)',
  REM: 'var(--color-stage-rem)',
  LIGHT: 'var(--color-stage-light)',
  DEEP: 'var(--color-stage-deep)'
}
export const STAGE_LABEL: Record<SleepStageType, string> = {
  AWAKE: 'Awake',
  REM: 'REM',
  LIGHT: 'Light',
  DEEP: 'Deep'
}
// Vertical band order, awake on top.
const ROW_ORDER: SleepStageType[] = ['AWAKE', 'REM', 'LIGHT', 'DEEP']

interface SleepStagesProps {
  night: SleepNight | null
  compact?: boolean
}

const EMPTY_STAGES: SleepNight['stages'] = []

// Hypnogram: each stage segment drawn as a rounded block on its own row,
// with a per-segment hover readout.
export function SleepStages({ night, compact = false }: SleepStagesProps): React.JSX.Element {
  const stages = night?.stages ?? EMPTY_STAGES
  const start = night ? new Date(night.startTime).getTime() : 0
  const end = night ? new Date(night.endTime).getTime() : 1
  const total = Math.max(1, end - start)
  const rowHeight = compact ? 18 : 22
  const rowGap = compact ? 6 : 8
  const [hover, setHover] = useState<{ i: number; text: string; left: number; top: number } | null>(null)

  const blocks = useMemo(
    () =>
      stages.map((seg, i) => {
        const segStart = new Date(seg.startTime).getTime()
        const segEnd = new Date(seg.endTime).getTime()
        const left = ((segStart - start) / total) * 100
        const width = Math.max(((segEnd - segStart) / total) * 100, 0.4)
        const row = ROW_ORDER.indexOf(seg.type)
        const minutes = Math.round((segEnd - segStart) / 60_000)
        return {
          key: i,
          type: seg.type,
          left,
          width,
          top: row * (rowHeight + rowGap),
          tip: `${STAGE_LABEL[seg.type]} · ${formatMinutes(minutes)} · ${formatClock(seg.startTime)}`
        }
      }),
    [rowGap, rowHeight, stages, start, total]
  )

  const connectors = blocks.slice(1).flatMap((next, index) => {
    const previous = blocks[index]
    if (!previous || previous.type === next.type) return []

    const previousIsAbove = previous.top < next.top
    const upper = previousIsAbove ? previous : next
    const lower = previousIsAbove ? next : previous
    const upperCenter = upper.top + rowHeight / 2
    const lowerCenter = lower.top + rowHeight / 2

    return [
      {
        key: `${previous.key}-${next.key}`,
        from: previous.key,
        to: next.key,
        left: next.left,
        top: upperCenter,
        height: lowerCenter - upperCenter,
        topColor: STAGE_COLOR[upper.type],
        bottomColor: STAGE_COLOR[lower.type]
      }
    ]
  })

  const chartHeight = ROW_ORDER.length * rowHeight + (ROW_ORDER.length - 1) * rowGap

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex flex-col justify-between py-0.5" style={{ height: chartHeight }}>
          {ROW_ORDER.map((t) => (
            <span
              key={t}
              className={`${compact ? 'text-[10px]' : 'text-[11px]'} leading-none text-ink-faint`}
              style={{ height: rowHeight }}
            >
              {STAGE_LABEL[t]}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height: chartHeight }}>
          {ROW_ORDER.map((_, r) => (
            <div
              key={r}
              className="absolute inset-x-0 rounded-full bg-white/[0.03]"
              style={{ top: r * (rowHeight + rowGap), height: rowHeight }}
            />
          ))}
          {connectors.map((connector) => (
            <div
              key={connector.key}
              aria-hidden
              className="pointer-events-none absolute w-[1.5px] -translate-x-1/2 rounded-full transition-opacity duration-150"
              style={{
                left: `${connector.left}%`,
                top: connector.top,
                height: connector.height,
                background: `linear-gradient(to bottom, ${connector.topColor}, ${connector.bottomColor})`,
                opacity:
                  hover && hover.i !== connector.from && hover.i !== connector.to
                    ? 0.35
                    : 0.85
              }}
            />
          ))}
          {blocks.map((b) => {
            const overlapLeft = b.left > 0.01 ? 1 : 0
            const overlapRight = b.left + b.width < 99.99 ? 1 : 0
            return (
              <div
                key={b.key}
                className="absolute z-[1] rounded-[5px] transition-opacity"
                style={{
                  left: `calc(${b.left}% - ${overlapLeft}px)`,
                  width: `calc(${b.width}% + ${overlapLeft + overlapRight}px)`,
                  top: b.top,
                  height: rowHeight,
                  background: STAGE_COLOR[b.type],
                  opacity: hover && hover.i !== b.key ? 0.55 : 1
                }}
                onPointerMove={() => setHover({ i: b.key, text: b.tip, left: b.left + b.width / 2, top: b.top })}
                onPointerLeave={() => setHover(null)}
              />
            )
          })}
          {hover && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-lg border border-hairline bg-panel-2/95 px-2 py-1 text-[11px] font-medium text-ink shadow-lg backdrop-blur-md"
              style={{ left: `${Math.min(88, Math.max(12, hover.left))}%`, top: hover.top }}
            >
              {hover.text}
            </div>
          )}
        </div>
      </div>
      <div
        className={`${compact ? 'mt-2 pl-[47px] text-[10px]' : 'mt-3 pl-[52px] text-[11px]'} flex items-center justify-between font-mono text-ink-faint`}
      >
        <span>{night ? formatClock(night.startTime) : '—'}</span>
        <span>{night ? formatClock(night.endTime) : '—'}</span>
      </div>
      <div className={`${compact ? 'mt-3' : 'mt-4'} grid grid-cols-4 gap-2`}>
        {ROW_ORDER.map((t) => (
          <div key={t} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[t] }} />
              <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-ink-dim`}>{STAGE_LABEL[t]}</span>
            </div>
            <span className={`${compact ? 'text-[12px]' : 'text-[13px]'} font-semibold text-ink`}>
              {night ? formatMinutes(night.stageMinutes[t] ?? 0) : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

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
const ROW_HEIGHT = 22
const ROW_GAP = 8

interface SleepStagesProps {
  night: SleepNight
}

// Hypnogram: each stage segment drawn as a rounded block on its own row,
// with a per-segment hover readout.
export function SleepStages({ night }: SleepStagesProps): React.JSX.Element {
  const start = new Date(night.startTime).getTime()
  const end = new Date(night.endTime).getTime()
  const total = Math.max(1, end - start)
  const [hover, setHover] = useState<{ i: number; text: string; left: number; top: number } | null>(null)

  const blocks = useMemo(
    () =>
      night.stages.map((seg, i) => {
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
          top: row * (ROW_HEIGHT + ROW_GAP),
          tip: `${STAGE_LABEL[seg.type]} · ${formatMinutes(minutes)} · ${formatClock(seg.startTime)}`
        }
      }),
    [night.stages, start, total]
  )

  const connectors = blocks.slice(1).flatMap((next, index) => {
    const previous = blocks[index]
    if (!previous || previous.type === next.type) return []

    const previousIsAbove = previous.top < next.top
    const upper = previousIsAbove ? previous : next
    const lower = previousIsAbove ? next : previous
    const upperCenter = upper.top + ROW_HEIGHT / 2
    const lowerCenter = lower.top + ROW_HEIGHT / 2

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

  const chartHeight = ROW_ORDER.length * ROW_HEIGHT + (ROW_ORDER.length - 1) * ROW_GAP

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex flex-col justify-between py-0.5" style={{ height: chartHeight }}>
          {ROW_ORDER.map((t) => (
            <span key={t} className="text-[11px] leading-none text-ink-faint" style={{ height: ROW_HEIGHT }}>
              {STAGE_LABEL[t]}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height: chartHeight }}>
          {ROW_ORDER.map((_, r) => (
            <div
              key={r}
              className="absolute inset-x-0 rounded-full bg-white/[0.03]"
              style={{ top: r * (ROW_HEIGHT + ROW_GAP), height: ROW_HEIGHT }}
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
                  height: ROW_HEIGHT,
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
      <div className="mt-3 flex items-center justify-between pl-[52px] font-mono text-[11px] text-ink-faint">
        <span>{formatClock(night.startTime)}</span>
        <span>{formatClock(night.endTime)}</span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {ROW_ORDER.map((t) => (
          <div key={t} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[t] }} />
              <span className="text-[11px] text-ink-dim">{STAGE_LABEL[t]}</span>
            </div>
            <span className="text-[13px] font-semibold text-ink">
              {formatMinutes(night.stageMinutes[t] ?? 0)}
            </span>
            {(night.stageCounts?.[t] ?? 0) > 0 && (
              <span className="text-[9.5px] text-ink-faint">
                {night.stageCounts?.[t]} {night.stageCounts?.[t] === 1 ? 'period' : 'periods'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

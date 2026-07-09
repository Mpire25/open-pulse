import { useMemo } from 'react'
import type { SleepNight, SleepStageType } from '@shared/types'
import { formatClock, formatMinutes } from '@/lib/format'

const STAGE_COLOR: Record<SleepStageType, string> = {
  AWAKE: 'var(--color-sleep-awake)',
  REM: 'var(--color-sleep-rem)',
  LIGHT: 'var(--color-sleep-core)',
  DEEP: 'var(--color-sleep-deep)'
}
const STAGE_LABEL: Record<SleepStageType, string> = {
  AWAKE: 'Awake',
  REM: 'REM',
  LIGHT: 'Core',
  DEEP: 'Deep'
}
// Vertical band order, awake on top.
const ROW_ORDER: SleepStageType[] = ['AWAKE', 'REM', 'LIGHT', 'DEEP']

interface SleepStagesProps {
  night: SleepNight
}

// Hypnogram: each stage segment drawn as a rounded block on its own row.
export function SleepStages({ night }: SleepStagesProps): React.JSX.Element {
  const start = new Date(night.startTime).getTime()
  const end = new Date(night.endTime).getTime()
  const total = Math.max(1, end - start)
  const rowHeight = 22
  const rowGap = 8

  const blocks = useMemo(
    () =>
      night.stages.map((seg, i) => {
        const segStart = new Date(seg.startTime).getTime()
        const segEnd = new Date(seg.endTime).getTime()
        const left = ((segStart - start) / total) * 100
        const width = Math.max(((segEnd - segStart) / total) * 100, 0.4)
        const row = ROW_ORDER.indexOf(seg.type)
        return { key: i, type: seg.type, left, width, top: row * (rowHeight + rowGap) }
      }),
    [night.stages, start, total]
  )

  const chartHeight = ROW_ORDER.length * rowHeight + (ROW_ORDER.length - 1) * rowGap

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex flex-col justify-between py-0.5" style={{ height: chartHeight }}>
          {ROW_ORDER.map((t) => (
            <span key={t} className="text-[11px] leading-none text-ink-faint" style={{ height: rowHeight }}>
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
          {blocks.map((b) => (
            <div
              key={b.key}
              className="absolute rounded-[5px]"
              style={{
                left: `${b.left}%`,
                width: `${b.width}%`,
                top: b.top,
                height: rowHeight,
                background: STAGE_COLOR[b.type]
              }}
            />
          ))}
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
            <span className="font-mono text-[13px] text-ink">
              {formatMinutes(night.stageMinutes[t] ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

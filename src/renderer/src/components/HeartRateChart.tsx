import { useMemo } from 'react'
import type { HeartSample } from '@shared/types'

interface HeartRateChartProps {
  series: HeartSample[]
  height?: number
}

// Smooth area sparkline of intraday heart rate. Pure SVG path math — no chart lib.
export function HeartRateChart({ series, height = 120 }: HeartRateChartProps): React.JSX.Element {
  const width = 640

  const { line, area, min, max, lastX, lastY } = useMemo(() => {
    if (series.length < 2) {
      return { line: '', area: '', min: 0, max: 0, lastX: 0, lastY: 0 }
    }
    const bpms = series.map((s) => s.bpm)
    const lo = Math.min(...bpms) - 6
    const hi = Math.max(...bpms) + 6
    const span = Math.max(1, hi - lo)
    const pad = 4

    const points = series.map((s, i) => {
      const x = (i / (series.length - 1)) * width
      const y = pad + (1 - (s.bpm - lo) / span) * (height - pad * 2)
      return [x, y] as const
    })

    // Catmull-Rom → cubic Bézier for an organic curve.
    let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] ?? points[i]
      const p1 = points[i]
      const p2 = points[i + 1]
      const p3 = points[i + 2] ?? p2
      const c1x = p1[0] + (p2[0] - p0[0]) / 6
      const c1y = p1[1] + (p2[1] - p0[1]) / 6
      const c2x = p2[0] - (p3[0] - p1[0]) / 6
      const c2y = p2[1] - (p3[1] - p1[1]) / 6
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
    }
    const last = points[points.length - 1]
    return {
      line: d,
      area: `${d} L ${width} ${height} L 0 ${height} Z`,
      min: Math.round(Math.min(...bpms)),
      max: Math.round(Math.max(...bpms)),
      lastX: last[0],
      lastY: last[1]
    }
  }, [series, height])

  if (!line) {
    return <div className="grid h-30 place-items-center text-[13px] text-ink-faint">No heart-rate data yet today.</div>
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id="hr-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-move)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-move)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hr-fill)" />
      <path d={line} fill="none" stroke="var(--color-move)" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={4} fill="var(--color-move)" />
      <circle cx={lastX} cy={lastY} r={7} fill="none" stroke="var(--color-move)" strokeOpacity={0.4} strokeWidth={2}>
        <animate attributeName="r" values="5;10;5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={6} y={14} className="fill-ink-faint" fontSize={11} fontFamily="var(--font-mono)">
        {max}
      </text>
      <text x={6} y={height - 6} className="fill-ink-faint" fontSize={11} fontFamily="var(--font-mono)">
        {min}
      </text>
    </svg>
  )
}

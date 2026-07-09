// Chart kit. Shared rules: thin marks with rounded data-ends, hairline solid
// gridlines, a hover layer on every plot (full-band hit targets, one tooltip
// with the value leading), previous render held while data refetches.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatMinuteOfDay } from '@/lib/format'

// ---------------------------------------------------------------------------
// Container measurement

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0)
    })
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

// ---------------------------------------------------------------------------
// Tooltip

export interface TipRow {
  label: string
  value: string
  color?: string
}

interface TipState {
  x: number
  y: number
  title: string
  rows: TipRow[]
}

function Tip({ tip, width }: { tip: TipState; width: number }): React.JSX.Element {
  // Flip sides near the right edge so the tooltip never clips.
  const onLeft = tip.x > width - 130
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[92px] rounded-[10px] border border-hairline bg-panel-2/95 px-2.5 py-2 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.9)] backdrop-blur-md"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${onLeft ? 'calc(-100% - 10px)' : '10px'}, -50%)`
      }}
    >
      <div className="text-[10.5px] font-medium text-ink-faint">{tip.title}</div>
      {tip.rows.map((row, i) => (
        <div key={i} className="mt-1 flex items-center gap-1.5">
          {row.color && <span className="h-0.5 w-3 rounded-full" style={{ background: row.color }} />}
          <span className="text-[13px] font-semibold text-ink">{row.value}</span>
          {row.label && <span className="text-[10.5px] text-ink-dim">{row.label}</span>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scale helpers

function niceMax(raw: number): number {
  if (raw <= 0) return 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  for (const mult of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (mult * mag >= raw) return mult * mag
  }
  return 10 * mag
}

function compact(n: number): string {
  if (Math.abs(n) >= 1000) return `${+(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(Math.round(n))
}

// ---------------------------------------------------------------------------
// Columns — hourly buckets and N-day trends

export interface ColumnDatum {
  key: string
  /** Tooltip title, e.g. "2 PM" or "Tue, Jun 30" */
  label: string
  value: number | null
  /** Optional tick under the column */
  tick?: string
}

interface ColumnChartProps {
  data: ColumnDatum[]
  color: string
  height?: number
  format?: (v: number) => string
  goal?: { value: number; label: string } | null
  /** Index drawn at full strength while the rest recede (e.g. selected day). */
  emphasisIndex?: number
  unitLabel?: string
}

export function ColumnChart({
  data,
  color,
  height = 150,
  format = (v) => compact(v),
  goal = null,
  emphasisIndex,
  unitLabel = ''
}: ColumnChartProps): React.JSX.Element {
  const [ref, width] = useWidth()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  const pad = { top: 14, bottom: 18, left: 0, right: 34 }
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom

  const rawMax = Math.max(goal?.value ?? 0, ...data.map((d) => d.value ?? 0))
  const max = niceMax(rawMax)
  const band = data.length > 0 ? plotW / data.length : 0
  const barW = Math.min(24, Math.max(3, band - 2))
  const y = (v: number): number => pad.top + plotH * (1 - v / max)

  const gridValues = [max / 2, max]

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {gridValues.map((v) => (
            <g key={v}>
              <line x1={0} x2={plotW} y1={y(v)} y2={y(v)} stroke="var(--color-hairline)" strokeWidth={1} />
              <text
                x={plotW + 6}
                y={y(v) + 3.5}
                className="fill-[var(--color-ink-faint)] font-mono"
                fontSize={10}
              >
                {compact(v)}
              </text>
            </g>
          ))}
          <line x1={0} x2={plotW} y1={y(0)} y2={y(0)} stroke="var(--color-hairline-strong)" strokeWidth={1} />

          {data.map((d, i) => {
            const cx = pad.left + band * i + band / 2
            if (d.value == null) return null
            const h = Math.max(2, plotH * (d.value / max))
            const recede = emphasisIndex != null && i !== emphasisIndex
            return (
              <path
                key={d.key}
                d={roundedColumn(cx - barW / 2, y(0) - h, barW, h)}
                fill={color}
                opacity={hovered === i ? 1 : recede ? 0.38 : 0.85}
              />
            )
          })}

          {goal && goal.value <= max && (
            <g>
              <line
                x1={0}
                x2={plotW}
                y1={y(goal.value)}
                y2={y(goal.value)}
                stroke="var(--color-ink-dim)"
                strokeWidth={1}
              />
              <text
                x={plotW + 6}
                y={y(goal.value) + 3.5}
                className="fill-[var(--color-ink-dim)] font-mono"
                fontSize={10}
              >
                {goal.label}
              </text>
            </g>
          )}

          {data.map(
            (d, i) =>
              d.tick && (
                <text
                  key={`t-${d.key}`}
                  x={pad.left + band * i + band / 2}
                  y={height - 4}
                  textAnchor="middle"
                  className="fill-[var(--color-ink-faint)] font-mono"
                  fontSize={10}
                >
                  {d.tick}
                </text>
              )
          )}

          {/* Full-band hit targets, larger than the marks */}
          {data.map((d, i) => (
            <rect
              key={`h-${d.key}`}
              x={pad.left + band * i}
              y={0}
              width={band}
              height={height}
              fill="transparent"
              onPointerMove={() => {
                setHovered(i)
                setTip({
                  x: pad.left + band * i + band / 2,
                  y: d.value != null ? y(d.value) : y(0),
                  title: d.label,
                  rows: [
                    {
                      label: unitLabel,
                      value: d.value != null ? format(d.value) : 'No data',
                      color: d.value != null ? color : undefined
                    }
                  ]
                })
              }}
              onPointerLeave={() => {
                setHovered(null)
                setTip(null)
              }}
            />
          ))}
        </svg>
      )}
      {tip && <Tip tip={tip} width={width} />}
    </div>
  )
}

/** Column with a 4px rounded data-end and a square baseline. */
function roundedColumn(x: number, top: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  return `M ${x} ${top + h} V ${top + r} Q ${x} ${top} ${x + r} ${top} H ${x + w - r} Q ${x + w} ${top} ${x + w} ${top + r} V ${top + h} Z`
}

// ---------------------------------------------------------------------------
// Trend line — daily values with an optional personal-baseline rule

export interface LinePoint {
  date: string
  label: string
  value: number | null
}

interface TrendLineProps {
  data: LinePoint[]
  color: string
  height?: number
  format?: (v: number) => string
  baseline?: { value: number; label: string } | null
  unitLabel?: string
}

export function TrendLine({
  data,
  color,
  height = 150,
  format = (v) => compact(v),
  baseline = null,
  unitLabel = ''
}: TrendLineProps): React.JSX.Element {
  const [ref, width] = useWidth()
  const [tip, setTip] = useState<TipState | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)

  const pad = { top: 14, bottom: 18, left: 0, right: 40 }
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom

  const present = data.filter((d): d is LinePoint & { value: number } => d.value != null)
  const values = present.map((d) => d.value)
  const lo = values.length ? Math.min(...values, baseline?.value ?? Infinity) : 0
  const hi = values.length ? Math.max(...values, baseline?.value ?? -Infinity) : 1
  const span = Math.max(hi - lo, Math.abs(hi) * 0.05, 1)
  const yLo = lo - span * 0.18
  const yHi = hi + span * 0.18
  const x = (i: number): number => pad.left + (data.length > 1 ? (plotW * i) / (data.length - 1) : plotW / 2)
  const y = (v: number): number => pad.top + plotH * (1 - (v - yLo) / (yHi - yLo))

  const path = useMemo(() => {
    let d = ''
    let started = false
    data.forEach((p, i) => {
      if (p.value == null) return
      d += `${started ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)} `
      started = true
    })
    return d
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height])

  const last = [...data].reverse().find((d) => d.value != null)
  const lastIndex = last ? data.lastIndexOf(last) : -1

  const onMove = (e: React.PointerEvent<SVGRectElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    let nearest = -1
    let best = Infinity
    data.forEach((p, i) => {
      if (p.value == null) return
      const dx = Math.abs(x(i) - px)
      if (dx < best) {
        best = dx
        nearest = i
      }
    })
    if (nearest < 0) return
    const p = data[nearest]
    setCursor(nearest)
    setTip({
      x: x(nearest),
      y: y(p.value!),
      title: p.label,
      rows: [{ label: unitLabel, value: format(p.value!), color }]
    })
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {baseline && (
            <g>
              <line
                x1={0}
                x2={plotW}
                y1={y(baseline.value)}
                y2={y(baseline.value)}
                stroke="var(--color-hairline-strong)"
                strokeWidth={1}
              />
              <text
                x={plotW + 6}
                y={y(baseline.value) + 3.5}
                className="fill-[var(--color-ink-faint)] font-mono"
                fontSize={10}
              >
                {baseline.label}
              </text>
            </g>
          )}

          {/* Area wash under the line */}
          {path && present.length > 1 && (
            <path
              d={`${path} L ${x(lastIndex)} ${pad.top + plotH} L ${x(data.indexOf(present[0] as LinePoint))} ${pad.top + plotH} Z`}
              fill={color}
              opacity={0.08}
            />
          )}
          {path && (
            <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}

          {cursor != null && data[cursor]?.value != null && (
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1={pad.top - 4}
              y2={pad.top + plotH}
              stroke="var(--color-hairline-strong)"
              strokeWidth={1}
            />
          )}

          {/* End marker with a surface ring */}
          {last && lastIndex >= 0 && (
            <circle
              cx={x(lastIndex)}
              cy={y(last.value!)}
              r={4}
              fill={color}
              stroke="var(--color-panel)"
              strokeWidth={2}
            />
          )}
          {cursor != null && data[cursor]?.value != null && (
            <circle
              cx={x(cursor)}
              cy={y(data[cursor].value!)}
              r={4}
              fill={color}
              stroke="var(--color-panel)"
              strokeWidth={2}
            />
          )}

          {/* Sparse date ticks: first and last */}
          {data.length > 1 && (
            <>
              <text x={0} y={height - 4} className="fill-[var(--color-ink-faint)] font-mono" fontSize={10}>
                {data[0].label}
              </text>
              <text
                x={plotW}
                y={height - 4}
                textAnchor="end"
                className="fill-[var(--color-ink-faint)] font-mono"
                fontSize={10}
              >
                {data[data.length - 1].label}
              </text>
            </>
          )}

          <rect
            x={0}
            y={0}
            width={Math.max(0, width - pad.right)}
            height={height}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => {
              setCursor(null)
              setTip(null)
            }}
          />
        </svg>
      )}
      {tip && <Tip tip={tip} width={width} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Intraday line — heart rate over the day, minute domain

interface IntradayLineProps {
  points: Array<{ minute: number; bpm: number }>
  color: string
  height?: number
}

export function IntradayLine({ points, color, height = 170 }: IntradayLineProps): React.JSX.Element {
  const [ref, width] = useWidth()
  const [tip, setTip] = useState<TipState | null>(null)
  const [cursorX, setCursorX] = useState<number | null>(null)

  const pad = { top: 14, bottom: 18, left: 0, right: 34 }
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom

  // Downsample to ~1 point per 2 plot px.
  const sampled = useMemo(() => {
    const target = Math.max(60, Math.floor(plotW / 2))
    if (points.length <= target) return points
    const step = points.length / target
    const out: Array<{ minute: number; bpm: number }> = []
    for (let i = 0; i < target; i++) out.push(points[Math.floor(i * step)])
    if (out.at(-1) !== points.at(-1)) out.push(points.at(-1)!)
    return out
  }, [points, plotW])

  const lo = sampled.length ? Math.min(...sampled.map((p) => p.bpm)) - 8 : 40
  const hi = sampled.length ? Math.max(...sampled.map((p) => p.bpm)) + 8 : 120
  const x = (minute: number): number => pad.left + (plotW * minute) / 1440
  const y = (bpm: number): number => pad.top + plotH * (1 - (bpm - lo) / (hi - lo))

  const path = useMemo(
    () => sampled.map((p, i) => `${i ? 'L' : 'M'} ${x(p.minute).toFixed(1)} ${y(p.bpm).toFixed(1)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sampled, width, height]
  )

  const hours = [6, 12, 18]

  const onMove = (e: React.PointerEvent<SVGRectElement>): void => {
    if (!sampled.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const minute = ((e.clientX - rect.left) / plotW) * 1440
    let nearest = sampled[0]
    for (const p of sampled) {
      if (Math.abs(p.minute - minute) < Math.abs(nearest.minute - minute)) nearest = p
    }
    setCursorX(x(nearest.minute))
    setTip({
      x: x(nearest.minute),
      y: y(nearest.bpm),
      title: formatMinuteOfDay(nearest.minute),
      rows: [{ label: 'bpm', value: String(nearest.bpm), color }]
    })
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {hours.map((h) => (
            <g key={h}>
              <line
                x1={x(h * 60)}
                x2={x(h * 60)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="var(--color-hairline)"
                strokeWidth={1}
              />
              <text
                x={x(h * 60)}
                y={height - 4}
                textAnchor="middle"
                className="fill-[var(--color-ink-faint)] font-mono"
                fontSize={10}
              >
                {h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`}
              </text>
            </g>
          ))}
          {[lo + 8, hi - 8].map((v) => (
            <text
              key={v}
              x={plotW + 6}
              y={y(v) + 3.5}
              className="fill-[var(--color-ink-faint)] font-mono"
              fontSize={10}
            >
              {Math.round(v)}
            </text>
          ))}

          {path && <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

          {cursorX != null && (
            <line
              x1={cursorX}
              x2={cursorX}
              y1={pad.top - 4}
              y2={pad.top + plotH}
              stroke="var(--color-hairline-strong)"
              strokeWidth={1}
            />
          )}

          <rect
            x={0}
            y={0}
            width={Math.max(0, width - pad.right)}
            height={height}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => {
              setCursorX(null)
              setTip(null)
            }}
          />
        </svg>
      )}
      {tip && <Tip tip={tip} width={width} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sparkline — stat-tile trend, de-emphasized with an accent endpoint

export function Spark({ values, color, width = 72, height = 24 }: { values: Array<number | null>; color: string; width?: number; height?: number }): React.JSX.Element | null {
  const present = values.filter((v): v is number => v != null)
  if (present.length < 2) return null
  const lo = Math.min(...present)
  const hi = Math.max(...present)
  const span = Math.max(hi - lo, 0.0001)
  const x = (i: number): number => (width * i) / (values.length - 1)
  const y = (v: number): number => 3 + (height - 6) * (1 - (v - lo) / span)

  let d = ''
  let started = false
  values.forEach((v, i) => {
    if (v == null) return
    d += `${started ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)} `
    started = true
  })
  const lastIdx = values.length - 1 - [...values].reverse().findIndex((v) => v != null)
  const lastVal = values[lastIdx]

  return (
    <svg width={width} height={height} className="block shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="var(--color-ink-faint)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {lastVal != null && <circle cx={x(lastIdx)} cy={y(lastVal)} r={2.5} fill={color} />}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Gauge ring — 260° instrument arc with etched ticks (not an Apple ring)

interface GaugeRingProps {
  value: number
  goal: number
  color: string
  size?: number
  stroke?: number
  children?: React.ReactNode
}

export function GaugeRing({ value, goal, color, size = 120, stroke = 10, children }: GaugeRingProps): React.JSX.Element {
  const sweep = 260
  const startAngle = 140 // degrees, clockwise from 12 o'clock
  const r = (size - stroke) / 2
  const c = size / 2
  const progress = goal > 0 ? Math.min(1, value / goal) : 0

  const polar = (angleDeg: number, radius: number): [number, number] => {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return [c + radius * Math.cos(rad), c + radius * Math.sin(rad)]
  }
  const arc = (from: number, to: number): string => {
    const [x1, y1] = polar(from, r)
    const [x2, y2] = polar(to, r)
    const large = to - from > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  const ticks = 26
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block">
        <path d={arc(startAngle, startAngle + sweep)} fill="none" stroke={color} opacity={0.16} strokeWidth={stroke} strokeLinecap="round" />
        {progress > 0.005 && (
          <path
            d={arc(startAngle, startAngle + sweep * progress)}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
        {/* Etched ticks over the band give it an instrument feel */}
        {Array.from({ length: ticks }, (_, i) => {
          const a = startAngle + (sweep * (i + 0.5)) / ticks
          const [x1, y1] = polar(a, r - stroke / 2)
          const [x2, y2] = polar(a, r + stroke / 2)
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--color-panel)" strokeWidth={2} />
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

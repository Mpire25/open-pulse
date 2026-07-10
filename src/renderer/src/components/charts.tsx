// Chart kit. Shared rules: thin marks with rounded data-ends, hairline solid
// gridlines, a hover layer on every plot (full-band hit targets, one tooltip
// with the value leading), previous render held while data refetches.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import { formatMinuteOfDay } from '@/lib/format'
import { sampleHeartRateForChart } from '@/lib/heart-rate'
import { lineAxis } from '@/lib/chart-scale'
import { cn } from '@/lib/utils'

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

function axisNumber(n: number): string {
  if (Math.abs(n) < 1 && n !== 0) return String(+n.toFixed(2))
  if (Math.abs(n) < 10 && !Number.isInteger(n)) return String(+n.toFixed(1))
  return compact(n)
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
  /** Short unit shown above the Y axis; defaults to the tooltip unit. */
  axisLabel?: string
}

export function ColumnChart({
  data,
  color,
  height = 170,
  format = (v) => compact(v),
  goal = null,
  emphasisIndex,
  unitLabel = '',
  axisLabel = unitLabel
}: ColumnChartProps): React.JSX.Element {
  const [ref, width] = useWidth()
  const [tip, setTip] = useState<TipState | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  const pad = { top: 14, bottom: 18, left: 0, right: 46 }
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom

  const rawMax = Math.max(goal?.value ?? 0, ...data.map((d) => d.value ?? 0))
  const max = niceMax(rawMax)
  const band = data.length > 0 ? plotW / data.length : 0
  const barW = Math.min(24, Math.max(3, band - 2))
  const y = (v: number): number => pad.top + plotH * (1 - v / max)

  const gridValues = [0, max / 2, max]

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {gridValues.map((v) => (
            <g key={v}>
              <line
                x1={0}
                x2={plotW}
                y1={y(v)}
                y2={y(v)}
                stroke={v === 0 ? 'var(--color-hairline-strong)' : 'var(--color-hairline)'}
                strokeWidth={1}
              />
              <text
                x={plotW + 6}
                y={y(v) + 3.5}
                className="fill-[var(--color-ink-faint)] font-mono"
                fontSize={10}
              >
                {axisNumber(v)}
              </text>
            </g>
          ))}
          {axisLabel && (
            <text
              x={width - 5}
              y={pad.top + plotH / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90 ${width - 5} ${pad.top + plotH / 2})`}
              className="fill-[var(--color-ink-faint)] font-mono"
              fontSize={9}
            >
              {axisLabel}
            </text>
          )}

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
                x={6}
                y={Math.max(pad.top + 9, y(goal.value) - 4)}
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
  /** Optional tick under the line, used for denser time ranges. */
  tick?: string
}

interface TrendLineProps {
  data: LinePoint[]
  color: string
  height?: number
  format?: (v: number) => string
  baseline?: { value: number; label: string } | null
  unitLabel?: string
  /** Short unit shown above the Y axis; defaults to the tooltip unit. */
  axisLabel?: string
  domain?: { min?: number; max?: number }
}

export function TrendLine({
  data,
  color,
  height = 170,
  format = (v) => compact(v),
  baseline = null,
  unitLabel = '',
  axisLabel = unitLabel,
  domain
}: TrendLineProps): React.JSX.Element {
  const [ref, width] = useWidth()
  const [tip, setTip] = useState<TipState | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)

  const pad = { top: 14, bottom: 18, left: 0, right: 48 }
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom

  const present = data.filter((d): d is LinePoint & { value: number } => d.value != null)
  const values = present.map((d) => d.value)
  const lo = values.length ? Math.min(...values, baseline?.value ?? Infinity) : 0
  const hi = values.length ? Math.max(...values, baseline?.value ?? -Infinity) : 1
  const automaticAxis = lineAxis(
    domain?.min != null ? Math.min(lo, domain.min) : lo,
    domain?.max != null ? Math.max(hi, domain.max) : hi
  )
  const axisMin = domain?.min ?? automaticAxis.min
  const axisMax = domain?.max ?? automaticAxis.max
  const axis = { min: axisMin, max: axisMax, ticks: [axisMin, (axisMin + axisMax) / 2, axisMax] }
  const x = (i: number): number => pad.left + (data.length > 1 ? (plotW * i) / (data.length - 1) : plotW / 2)
  const y = (v: number): number => pad.top + plotH * (1 - (v - axis.min) / (axis.max - axis.min))

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
  }, [axis.max, axis.min, data, height, width])

  const last = [...data].reverse().find((d) => d.value != null)
  const lastIndex = last ? data.lastIndexOf(last) : -1
  const labelledTickIndices = data.flatMap((point, index) => (point.tick ? [index] : []))
  const tickIndices = labelledTickIndices.length
    ? labelledTickIndices
    : [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])].filter((index) => index >= 0)

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
          {axis.ticks.map((value) => (
            <g key={value}>
              <line
                x1={0}
                x2={plotW}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--color-hairline)"
                strokeWidth={1}
              />
              <text
                x={plotW + 6}
                y={y(value) + 3.5}
                className="fill-[var(--color-ink-faint)] font-mono"
                fontSize={10}
              >
                {format(value)}
              </text>
            </g>
          ))}
          {axisLabel && (
            <text
              x={width - 5}
              y={pad.top + plotH / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90 ${width - 5} ${pad.top + plotH / 2})`}
              className="fill-[var(--color-ink-faint)] font-mono"
              fontSize={9}
            >
              {axisLabel}
            </text>
          )}
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
                x={6}
                y={Math.max(pad.top + 9, y(baseline.value) - 4)}
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

          {tickIndices.map((index) => (
            <text
              key={`tick-${data[index].date}-${index}`}
              x={x(index)}
              y={height - 4}
              textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
              className="fill-[var(--color-ink-faint)] font-mono"
              fontSize={10}
            >
              {data[index].tick ?? data[index].label}
            </text>
          ))}

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
  domain?: { startMinute: number; endMinute: number }
}

// A single SVG path and nearest-point hover remain responsive at this size.
// Below the cap every received reading is drawn; only larger series are reduced.
const MAX_HEART_RATE_CHART_POINTS = 2000

export function IntradayLine({ points, color, height = 170, domain }: IntradayLineProps): React.JSX.Element {
  const [ref, width] = useWidth()
  const [tip, setTip] = useState<TipState | null>(null)
  const [cursorX, setCursorX] = useState<number | null>(null)

  const pad = { top: 14, bottom: 18, left: 0, right: 46 }
  const plotW = Math.max(0, width - pad.left - pad.right)
  const plotH = height - pad.top - pad.bottom
  const domainStart = domain?.startMinute ?? 0
  const domainEnd = Math.max(domainStart + 1, domain?.endMinute ?? 1440)
  const domainSpan = domainEnd - domainStart

  const sampled = useMemo(
    () => sampleHeartRateForChart(points, MAX_HEART_RATE_CHART_POINTS, domainStart, domainEnd),
    [domainEnd, domainStart, points]
  )

  const rawLo = sampled.length ? Math.min(...sampled.map((p) => p.bpm)) : 40
  const rawHi = sampled.length ? Math.max(...sampled.map((p) => p.bpm)) : 120
  const axis = lineAxis(rawLo, rawHi)
  const x = (minute: number): number => pad.left + (plotW * (minute - domainStart)) / domainSpan
  const y = (bpm: number): number => pad.top + plotH * (1 - (bpm - axis.min) / (axis.max - axis.min))

  const path = useMemo(
    () => sampled.map((p, i) => `${i ? 'L' : 'M'} ${x(p.minute).toFixed(1)} ${y(p.bpm).toFixed(1)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [axis.max, axis.min, domainSpan, domainStart, height, sampled, width]
  )

  const timeTicks = domain
    ? [domainStart, domainStart + domainSpan / 2, domainEnd]
    : [6 * 60, 12 * 60, 18 * 60]

  const onMove = (e: React.PointerEvent<SVGRectElement>): void => {
    if (!sampled.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const minute = domainStart + ((e.clientX - rect.left) / plotW) * domainSpan
    let nearest = sampled[0]
    for (const p of sampled) {
      if (Math.abs(p.minute - minute) < Math.abs(nearest.minute - minute)) nearest = p
    }
    setCursorX(x(nearest.minute))
    setTip({
      x: x(nearest.minute),
      y: y(nearest.bpm),
      title: formatMinuteOfDay(nearest.minute, domainSpan <= 60),
      rows: [{ label: 'bpm', value: String(nearest.bpm), color }]
    })
  }

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} className="block">
          {axis.ticks.map((value) => (
            <g key={value}>
              <line
                x1={0}
                x2={plotW}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--color-hairline)"
                strokeWidth={1}
              />
              <text
                x={plotW + 6}
                y={y(value) + 3.5}
                className="fill-[var(--color-ink-faint)] font-mono"
                fontSize={10}
              >
                {axisNumber(value)}
              </text>
            </g>
          ))}
          <text
            x={width - 5}
            y={pad.top + plotH / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90 ${width - 5} ${pad.top + plotH / 2})`}
            className="fill-[var(--color-ink-faint)] font-mono"
            fontSize={9}
          >
            bpm
          </text>
          {timeTicks.map((minute) => (
            <g key={minute}>
              <line
                x1={x(minute)}
                x2={x(minute)}
                y1={pad.top}
                y2={pad.top + plotH}
                stroke="var(--color-hairline)"
                strokeWidth={1}
              />
              <text
                x={x(minute)}
                y={height - 4}
                textAnchor="middle"
                className="fill-[var(--color-ink-faint)] font-mono"
                fontSize={10}
              >
                {formatMinuteOfDay(Math.round(minute))}
              </text>
            </g>
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
    <svg width={width} height={height} className="block min-w-0 max-w-[55%] shrink" aria-hidden>
      <path d={d} fill="none" stroke="var(--color-ink-faint)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {lastVal != null && <circle cx={x(lastIdx)} cy={y(lastVal)} r={2.5} fill={color} />}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Progress ring — a clean full-circle goal ring with round caps

interface ProgressRingProps {
  value: number
  goal: number
  color: string
  size?: number
  stroke?: number
  className?: string
  children?: React.ReactNode
}

const RING_EASE = [0.19, 1, 0.22, 1] as const

export function ProgressRing({
  value,
  goal,
  color,
  size = 120,
  stroke = 10,
  className,
  children
}: ProgressRingProps): React.JSX.Element {
  const reduceMotion = useReducedMotion()
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const ratio = goal > 0 ? Math.max(0, value / goal) : 0
  const isOverGoal = ratio > 1
  const animatedRatio = useMotionValue(reduceMotion ? ratio : 0)
  const firstLapOffset = useTransform(animatedRatio, (current) => {
    const lap = Math.min(1, Math.max(0, current))
    return circumference * (1 - lap)
  })
  const extraLapProgress = useTransform(animatedRatio, (current) => visibleExtraLap(current))
  const extraLapOffset = useTransform(extraLapProgress, (lap) => circumference * (1 - lap))
  const capX = useTransform(extraLapProgress, (lap) => c + r * Math.cos(Math.PI * 2 * lap))
  const capY = useTransform(extraLapProgress, (lap) => c + r * Math.sin(Math.PI * 2 * lap))
  const capRotation = useTransform(extraLapProgress, (lap) => lap * 360)
  const capOpacity = useTransform(animatedRatio, [0.995, 1.005], [0, 1])
  const capShadowOpacity = useTransform(animatedRatio, [0.995, 1.005], [0, 0.34])
  const capEdgeOpacity = useTransform(animatedRatio, [0.995, 1.005], [0, 0.48])

  useEffect(() => {
    if (reduceMotion) {
      animatedRatio.set(ratio)
      return
    }

    animatedRatio.set(0)
    const controls = animate(animatedRatio, ratio, {
      duration: Math.min(2.6, 0.75 + Math.min(ratio, 2.5) * 0.72),
      ease: RING_EASE
    })
    return () => controls.stop()
  }, [animatedRatio, ratio, reduceMotion])

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="block h-full w-full overflow-visible -rotate-90" aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke={color} opacity={0.15} strokeWidth={stroke} />
        {ratio > 0.004 && (
          <motion.circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: firstLapOffset }}
          />
        )}
        {isOverGoal && (
          <>
            <motion.circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              style={{ strokeDashoffset: extraLapOffset }}
            />
            <motion.circle
              cx={capX}
              cy={capY}
              r={stroke / 2 + 0.4}
              fill="none"
              stroke="var(--color-canvas)"
              strokeWidth={3.4}
              strokeDasharray={`${Math.PI * (stroke / 2 + 0.4)} ${Math.PI * (stroke / 2 + 0.4)}`}
              style={{
                filter: 'blur(1.2px)',
                opacity: capShadowOpacity,
                rotate: capRotation,
                transformBox: 'fill-box',
                transformOrigin: 'center'
              }}
            />
            <motion.circle
              cx={capX}
              cy={capY}
              r={stroke / 2}
              fill={color}
              style={{ opacity: capOpacity }}
            />
            <motion.circle
              cx={capX}
              cy={capY}
              r={stroke / 2 + 0.15}
              fill="none"
              stroke="var(--color-canvas)"
              strokeWidth={1.4}
              strokeDasharray={`${(Math.PI * stroke) / 2} ${(Math.PI * stroke) / 2}`}
              style={{
                filter: 'blur(0.3px)',
                opacity: capEdgeOpacity,
                rotate: capRotation,
                transformBox: 'fill-box',
                transformOrigin: 'center'
              }}
            />
          </>
        )}
      </svg>
      <motion.div
        className="absolute inset-0 grid place-items-center"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.7, delay: reduceMotion ? 0 : 0.12, ease: RING_EASE }}
      >
        {children}
      </motion.div>
    </div>
  )
}

function visibleExtraLap(ratio: number): number {
  if (ratio <= 1) return 0
  const extra = ratio - 1
  const remainder = extra - Math.floor(extra)
  return remainder < 0.0001 && extra > 0 ? 1 : remainder
}

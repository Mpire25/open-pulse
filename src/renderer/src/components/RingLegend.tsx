import { formatInt } from '@/lib/format'

interface RingLegendItem {
  label: string
  value: number
  goal: number
  unit: string
  color: string
}

export function RingLegend({ items }: { items: RingLegendItem[] }): React.JSX.Element {
  return (
    <div className="flex flex-col divide-y divide-hairline">
      {items.map((item) => {
        const pct = Math.round((item.value / item.goal) * 100)
        return (
          <div key={item.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              <span className="text-[13px] font-medium text-ink">{item.label}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[15px] font-medium text-ink" style={{ color: item.color }}>
                {formatInt(item.value)}
              </span>
              <span className="font-mono text-[12px] text-ink-faint">
                / {formatInt(item.goal)} {item.unit}
              </span>
              <span className="ml-1 w-9 text-right font-mono text-[11px] text-ink-faint">{pct}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

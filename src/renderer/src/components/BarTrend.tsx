import { motion } from 'framer-motion'
import { weekdayShort } from '@/lib/format'

interface BarTrendProps {
  data: { date: string; value: number }[]
  color: string
  goal?: number
  formatValue?: (v: number) => string
}

// Weekly bar chart with a goal line, animated bar reveal, and hover tooltips.
export function BarTrend({ data, color, goal, formatValue }: BarTrendProps): React.JSX.Element {
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value), 1)
  const todayIdx = data.length - 1

  return (
    <div className="relative h-40">
      {goal !== undefined && goal > 0 && (
        <div
          className="absolute inset-x-0 border-t border-dashed border-hairline-strong"
          style={{ bottom: `${(goal / max) * 100}%` }}
        >
          <span className="absolute -top-4 right-0 font-mono text-[10px] text-ink-faint">
            Goal {formatValue ? formatValue(goal) : goal}
          </span>
        </div>
      )}
      <div className="flex h-full items-end gap-2.5">
        {data.map((d, i) => {
          const pct = Math.max((d.value / max) * 100, 1.5)
          const isToday = i === todayIdx
          return (
            <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
              <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-md bg-panel-2 px-2 py-1 font-mono text-[11px] text-ink opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                {formatValue ? formatValue(d.value) : d.value}
              </div>
              <motion.div
                className="w-full rounded-md"
                style={{
                  background: color,
                  opacity: isToday ? 1 : 0.5
                }}
                initial={{ height: 0 }}
                animate={{ height: `${pct}%` }}
                transition={{ duration: 0.7, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              />
              <span
                className={`mt-2 text-center text-[11px] ${isToday ? 'font-medium text-ink' : 'text-ink-faint'}`}
              >
                {weekdayShort(d.date)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

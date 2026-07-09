import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CaretLeft, CaretRight, CalendarBlank } from '@phosphor-icons/react'
import { isoToday, navDateLabel, shiftDate } from '@/lib/format'
import { cn } from '@/lib/utils'

interface DateNavProps {
  date: string
  onChange: (date: string) => void
}

/** Prev/next day arrows, a friendly label, and a calendar popover. */
export function DateNav({ date, onChange }: DateNavProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const today = isoToday()
  const atToday = date >= today

  return (
    <div className="no-drag relative flex items-center gap-1">
      <NavArrow label="Previous day" onClick={() => onChange(shiftDate(date, -1))}>
        <CaretLeft size={14} weight="bold" />
      </NavArrow>

      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-[12.5px] font-semibold text-ink transition-colors',
          open ? 'border-hairline bg-white/[0.07]' : 'hover:bg-white/[0.05]'
        )}
      >
        <CalendarBlank size={13} weight="bold" className="text-ink-dim" />
        {navDateLabel(date)}
      </button>

      <NavArrow label="Next day" disabled={atToday} onClick={() => onChange(shiftDate(date, 1))}>
        <CaretRight size={14} weight="bold" />
      </NavArrow>

      {!atToday && (
        <button
          onClick={() => onChange(today)}
          className="ml-1 h-7 rounded-lg px-2 text-[11.5px] font-semibold text-accent transition-colors hover:bg-accent-soft"
        >
          Today
        </button>
      )}

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="absolute left-1/2 top-9 z-50 w-[264px] -translate-x-1/2 rounded-2xl border border-hairline bg-panel-2/95 p-3 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)] backdrop-blur-2xl"
            >
              <Presets
                date={date}
                onPick={(d) => {
                  onChange(d)
                  setOpen(false)
                }}
              />
              <div className="mx-1 my-2 h-px bg-hairline" />
              <Calendar
                selected={date}
                maxDate={today}
                onPick={(d) => {
                  onChange(d)
                  setOpen(false)
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function NavArrow({
  label,
  disabled,
  onClick,
  children
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid h-7 w-7 place-items-center rounded-lg text-ink-dim transition-colors',
        disabled ? 'opacity-30' : 'hover:bg-white/[0.06] hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

function Presets({ date, onPick }: { date: string; onPick: (d: string) => void }): React.JSX.Element {
  const today = isoToday()
  const presets = [
    { label: 'Today', value: today },
    { label: 'Yesterday', value: shiftDate(today, -1) },
    { label: 'A week ago', value: shiftDate(today, -7) }
  ]
  return (
    <div className="flex flex-col">
      {presets.map((p) => (
        <button
          key={p.label}
          onClick={() => onPick(p.value)}
          className={cn(
            'flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-white/[0.05]',
            date === p.value ? 'font-semibold text-ink' : 'text-ink-dim'
          )}
        >
          {p.label}
          {date === p.value && <span className="text-accent">✓</span>}
        </button>
      ))}
    </div>
  )
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function Calendar({
  selected,
  maxDate,
  onPick
}: {
  selected: string
  maxDate: string
  onPick: (d: string) => void
}): React.JSX.Element {
  const [viewMonth, setViewMonth] = useState(() => selected.slice(0, 7)) // YYYY-MM

  const grid = useMemo(() => {
    const [y, m] = viewMonth.split('-').map(Number)
    const first = new Date(Date.UTC(y, m - 1, 1, 12))
    const daysInMonth = new Date(Date.UTC(y, m, 0, 12)).getUTCDate()
    // Monday-first offset
    const lead = (first.getUTCDay() + 6) % 7
    const cells: Array<string | null> = Array.from({ length: lead }, () => null)
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${viewMonth}-${String(d).padStart(2, '0')}`)
    }
    return cells
  }, [viewMonth])

  const monthLabel = new Date(`${viewMonth}-01T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })
  const shiftMonth = (delta: number): void => {
    const [y, m] = viewMonth.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1, 12))
    setViewMonth(d.toISOString().slice(0, 7))
  }
  const atCurrentMonth = viewMonth >= maxDate.slice(0, 7)

  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-2">
        <NavArrow label="Previous month" onClick={() => shiftMonth(-1)}>
          <CaretLeft size={12} weight="bold" />
        </NavArrow>
        <span className="text-[12px] font-semibold text-ink">{monthLabel}</span>
        <NavArrow label="Next month" disabled={atCurrentMonth} onClick={() => shiftMonth(1)}>
          <CaretRight size={12} weight="bold" />
        </NavArrow>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="grid h-6 place-items-center text-[10px] font-medium text-ink-faint">
            {d}
          </span>
        ))}
        {grid.map((day, i) =>
          day ? (
            <button
              key={day}
              disabled={day > maxDate}
              onClick={() => onPick(day)}
              className={cn(
                'grid h-7 w-7 place-items-center justify-self-center rounded-full text-[12px] tabular-nums transition-colors',
                day === selected
                  ? 'bg-accent font-semibold text-white'
                  : day > maxDate
                    ? 'text-ink-faint/50'
                    : 'text-ink-dim hover:bg-white/[0.07] hover:text-ink'
              )}
            >
              {Number(day.slice(8))}
            </button>
          ) : (
            <span key={`x-${i}`} />
          )
        )}
      </div>
    </div>
  )
}

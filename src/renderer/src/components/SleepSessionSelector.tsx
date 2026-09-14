import type { SleepDay } from '@shared/types'
import { sleepSessionId } from '@shared/sleep'
import { formatClock, formatMinutes } from '@/lib/format'

export function SleepSessionSelector({ day, selectedId, onSelect }: {
  day: SleepDay | null
  selectedId: string | undefined
  onSelect: (id: string) => void
}): React.JSX.Element | null {
  if (!day || day.sessions.length < 2) return null
  return (
    <div className="flex flex-wrap gap-2 px-4 pt-2" role="group" aria-label="Sleep session">
      {day.sessions.map((session) => {
        const id = sleepSessionId(session)
        const main = id === day.mainSessionId
        return (
          <button key={id} type="button" aria-pressed={id === selectedId} onClick={() => onSelect(id)}
            className={`rounded-xl border px-3 py-2 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${id === selectedId ? 'border-accent/50 bg-sleep-soft text-ink' : 'border-hairline text-ink-dim hover:bg-white/[0.04]'}`}>
            <span className="font-medium">{main ? 'Main sleep' : 'Additional sleep'}</span>
            <span className="ml-2 font-mono">{formatMinutes(session.minutesAsleep)}</span>
            <span className="mt-0.5 block text-[11px] text-ink-dim">{formatClock(session.startTime)}–{formatClock(session.endTime)}</span>
          </button>
        )
      })}
    </div>
  )
}

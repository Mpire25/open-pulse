import { PersonSimpleRun } from '@phosphor-icons/react'
import { formatClock, formatInt, formatMinutes } from '@/lib/format'
import type { Workout } from '@shared/types'

export function WorkoutList({ workouts }: { workouts: Workout[] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {workouts.map((w) => (
        <div key={w.id} className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-recovery-soft">
              <PersonSimpleRun size={17} weight="fill" style={{ color: 'var(--color-recovery)' }} />
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-ink">{w.name}</div>
              <div className="text-[11px] text-ink-faint">
                {formatClock(w.startTime)} · {formatMinutes(w.durationMin)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 text-[12px] text-ink-dim">
            {w.distanceKm != null && <Fact label="km" value={w.distanceKm.toFixed(2)} />}
            {w.calories != null && <Fact label="kcal" value={formatInt(w.calories)} />}
            {w.avgHeartRate != null && <Fact label="avg bpm" value={String(w.avgHeartRate)} />}
            {w.activeZoneMinutes != null && <Fact label="zone min" value={String(w.activeZoneMinutes)} />}
          </div>
        </div>
      ))}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-mono text-[12.5px] text-ink">{value}</span>
      <span className="text-[10.5px] text-ink-faint">{label}</span>
    </span>
  )
}

import type { SleepDay, SleepNight } from './types'

export function sleepSessionId(session: Pick<SleepNight, 'id' | 'startTime' | 'endTime'>): string {
  return session.id ?? `${Date.parse(session.startTime)}:${Date.parse(session.endTime)}`
}

/** The API reconciles sources; also remove repeated records/intervals across pages. */
export function groupSleepDays(nights: SleepNight[], complete = true): SleepDay[] {
  const byDate = new Map<string, SleepNight[]>()
  const ids = new Set<string>()
  const intervals = new Set<string>()
  for (const night of nights) {
    const start = Date.parse(night.startTime)
    const end = Date.parse(night.endTime)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const id = sleepSessionId(night)
    const interval = `${start}:${end}`
    if (ids.has(id) || intervals.has(interval)) continue
    ids.add(id)
    intervals.add(interval)
    const sessions = byDate.get(night.date) ?? []
    sessions.push({ ...night, id })
    byDate.set(night.date, sessions)
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, sessions]) => {
    sessions.sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || sleepSessionId(a).localeCompare(sleepSessionId(b)))
    const main = sessions.reduce((best, next) =>
      Number(next.isMainSleep) > Number(best.isMainSleep) ||
      (next.isMainSleep === best.isMainSleep && next.minutesAsleep > best.minutesAsleep) ? next : best
    )
    const minutesAsleep = sessions.reduce((sum, session) => sum + session.minutesAsleep, 0)
    const minutesInSleepPeriod = sessions.reduce((sum, session) => sum + session.minutesInSleepPeriod, 0)
    return {
      date, sessions, mainSessionId: sleepSessionId(main), minutesAsleep, minutesInSleepPeriod,
      efficiency: sessions.every((session) => session.minutesInSleepPeriod > 0) && minutesInSleepPeriod > 0
        ? Math.round(minutesAsleep / minutesInSleepPeriod * 100) : null,
      complete
    }
  })
}

export function selectedSleepSession(day: SleepDay | null | undefined, sessionId?: string | null): SleepNight | null {
  if (!day) return null
  return day.sessions.find((session) => sleepSessionId(session) === (sessionId ?? day.mainSessionId)) ??
    day.sessions.find((session) => sleepSessionId(session) === day.mainSessionId) ?? day.sessions[0] ?? null
}

/** Read old cache data without declaring its single retained session complete. */
export function cachedSleepDay(record: { sleepDay?: SleepDay | null; sleep?: SleepNight | null } | undefined): SleepDay | null {
  if (record?.sleepDay !== undefined) return record.sleepDay
  return record?.sleep ? groupSleepDays([record.sleep], false)[0] ?? null : null
}

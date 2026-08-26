/** Milliseconds until the next local midnight, including DST-short or -long days. */
export function millisecondsUntilNextLocalDay(now: Date): number {
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  return Math.max(0, nextMidnight.getTime() - now.getTime())
}

export interface LineAxis {
  min: number
  max: number
  ticks: number[]
}

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / magnitude
  for (const multiplier of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (multiplier >= fraction) return multiplier * magnitude
  }
  return 10 * magnitude
}

/**
 * Builds a close-fitting line-chart domain with a little breathing room.
 *
 * The rounding increment is deliberately much finer than the distance between
 * the three displayed grid lines. Using the grid-line interval for rounding
 * can add nearly a full interval at both ends, making small changes look flat.
 */
export function lineAxis(rawLo: number, rawHi: number): LineAxis {
  const rawSpan = rawHi - rawLo
  const span = rawSpan > 0 ? rawSpan : Math.max(Math.abs(rawHi) * 0.04, 0.1)
  const paddedLo = rawLo - span * 0.12
  const paddedHi = rawHi + span * 0.12
  const roundingStep = niceStep((paddedHi - paddedLo) / 10)
  const min = Math.floor(paddedLo / roundingStep) * roundingStep
  const max = Math.ceil(paddedHi / roundingStep) * roundingStep
  const midpoint = Math.abs((min + max) / 2) < 1e-10 ? 0 : (min + max) / 2
  return { min, max, ticks: [min, midpoint, max] }
}

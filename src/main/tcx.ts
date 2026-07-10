import type { WorkoutTrackResult } from '../shared/types'

function numberValue(value: string | null): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function tcxValue(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]+)</(?:\\w+:)?${tag}>`, 'i'))
  return match?.[1]?.trim() ?? null
}

export function parseExerciseTcx(tcx: string): WorkoutTrackResult {
  const points: WorkoutTrackResult['points'] = []
  const trackpointPattern = /<(?:\w+:)?Trackpoint\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Trackpoint>/gi
  for (const match of tcx.matchAll(trackpointPattern)) {
    const block = match[1]
    const heartBlock = block.match(/<(?:\w+:)?HeartRateBpm\b[^>]*>([\s\S]*?)<\/(?:\w+:)?HeartRateBpm>/i)?.[1] ?? ''
    const latitude = numberValue(tcxValue(block, 'LatitudeDegrees'))
    const longitude = numberValue(tcxValue(block, 'LongitudeDegrees'))
    const heartRate = numberValue(tcxValue(heartBlock, 'Value'))
    const altitudeM = numberValue(tcxValue(block, 'AltitudeMeters'))
    const cadence = numberValue(tcxValue(block, 'Cadence'))
    if (latitude == null && longitude == null && heartRate == null && altitudeM == null) continue
    points.push({
      time: tcxValue(block, 'Time'),
      latitude,
      longitude,
      altitudeM,
      heartRate,
      cadence
    })
  }
  return { points }
}

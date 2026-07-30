export const CHART_PLOT = {
  top: 14,
  bottom: 18,
  left: 0,
  right: 46
} as const

export const SLEEP_STAGE_FRAME = {
  compact: {
    rowHeight: 18,
    rowGap: 6,
    timeOffset: 47,
    timeHeight: 12,
    summaryLabelHeight: 12,
    summaryValueHeight: 15
  },
  regular: {
    rowHeight: 22,
    rowGap: 8,
    timeOffset: 52,
    timeHeight: 14,
    summaryLabelHeight: 14,
    summaryValueHeight: 16
  }
} as const

export function sleepStageChartHeight(compact: boolean): number {
  const frame = compact ? SLEEP_STAGE_FRAME.compact : SLEEP_STAGE_FRAME.regular
  return frame.rowHeight * 4 + frame.rowGap * 3
}

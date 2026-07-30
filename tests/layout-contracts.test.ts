import { describe, expect, test } from 'bun:test'
import {
  CHART_PLOT,
  SLEEP_STAGE_FRAME,
  chartColumnMaxWidth,
  chartColumnWidth,
  sleepStageChartHeight
} from '../src/renderer/src/lib/layout-contracts'

describe('loading and loaded layout contracts', () => {
  test('keeps chart skeletons on the production plot frame', () => {
    expect(CHART_PLOT).toEqual({ top: 14, bottom: 18, left: 0, right: 46 })
  })

  test('shares density-aware column widths between skeleton and loaded charts', () => {
    expect(chartColumnMaxWidth(7)).toBe(40)
    expect(chartColumnMaxWidth(8)).toBe(24)
    expect(chartColumnWidth(80, 7)).toBe(40)
    expect(chartColumnWidth(20, 30)).toBe(18)
    expect(chartColumnWidth(2, 365)).toBe(3)
  })

  test('derives sleep-stage heights from the shared row geometry', () => {
    expect(sleepStageChartHeight(true)).toBe(90)
    expect(sleepStageChartHeight(false)).toBe(112)
    expect(SLEEP_STAGE_FRAME.compact.timeOffset).toBe(47)
    expect(SLEEP_STAGE_FRAME.regular.timeOffset).toBe(52)
    expect(SLEEP_STAGE_FRAME.compact.timeHeight).toBe(12)
    expect(SLEEP_STAGE_FRAME.regular.timeHeight).toBe(14)
    expect(SLEEP_STAGE_FRAME.compact.summaryLabelHeight).toBe(12)
    expect(SLEEP_STAGE_FRAME.regular.summaryLabelHeight).toBe(14)
    expect(SLEEP_STAGE_FRAME.compact.summaryValueHeight).toBe(15)
    expect(SLEEP_STAGE_FRAME.regular.summaryValueHeight).toBe(16)
  })
})

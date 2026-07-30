import { describe, expect, test } from 'bun:test'
import {
  CHART_PLOT,
  SLEEP_STAGE_FRAME,
  sleepStageChartHeight
} from '../src/renderer/src/lib/layout-contracts'

describe('loading and loaded layout contracts', () => {
  test('keeps chart skeletons on the production plot frame', () => {
    expect(CHART_PLOT).toEqual({ top: 14, bottom: 18, left: 0, right: 46 })
  })

  test('derives sleep-stage heights from the shared row geometry', () => {
    expect(sleepStageChartHeight(true)).toBe(90)
    expect(sleepStageChartHeight(false)).toBe(112)
    expect(SLEEP_STAGE_FRAME.compact.timeOffset).toBe(47)
    expect(SLEEP_STAGE_FRAME.regular.timeOffset).toBe(52)
  })
})

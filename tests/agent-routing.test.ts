import { describe, expect, test } from 'bun:test'
import { fastHealthPlanForRequest } from '../src/main/agent-routing'

const TODAY = '2026-07-28'

describe('adaptive assistant routing', () => {
  test('prefetches exact daily values without a planning turn', () => {
    expect(fastHealthPlanForRequest('How many steps did I do yesterday?', TODAY)).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['steps'],
        startDate: '2026-07-27',
        endDate: '2026-07-27'
      },
      reason: 'exact-value'
    })
  })

  test('uses wake-date semantics for last-night sleep', () => {
    expect(fastHealthPlanForRequest('How did I sleep last night?', TODAY)).toEqual({
      tool: 'query_sleep',
      args: {
        startDate: TODAY,
        endDate: TODAY,
        detail: 'summary'
      },
      reason: 'exact-value'
    })
  })

  test('supports an unambiguous day-before-yesterday request', () => {
    expect(fastHealthPlanForRequest('How many steps did I do the day before yesterday?', TODAY)).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['steps'],
        startDate: '2026-07-26',
        endDate: '2026-07-26'
      },
      reason: 'exact-value'
    })
  })

  test('falls back when date language is present but not fully parsed', () => {
    expect(fastHealthPlanForRequest('How many steps did I do on July 3rd?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do last Tuesday?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do in March?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do on 2026-02-30?', TODAY)).toBeNull()
  })

  test('does not silently truncate ranges beyond the health-tool limit', () => {
    expect(fastHealthPlanForRequest('How many steps did I do in the last 365 days?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do in the last 0 days?', TODAY)).toBeNull()
  })

  test('prefetches one combined range for common comparisons', () => {
    expect(fastHealthPlanForRequest('Compare my steps this week with last week', TODAY)).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['steps'],
        startDate: '2026-07-20',
        endDate: TODAY
      },
      reason: 'comparison'
    })
  })

  test('uses a bounded default range for straightforward trends', () => {
    expect(fastHealthPlanForRequest('Is my resting heart rate trending up or down?', TODAY)).toEqual({
      tool: 'analyze_daily_metrics',
      args: {
        metrics: ['restingHeartRate'],
        startDate: '2026-06-29',
        endDate: TODAY,
        operation: 'summary'
      },
      reason: 'trend'
    })
  })

  test('keeps multi-day totals as raw daily data rather than a trend summary', () => {
    expect(fastHealthPlanForRequest('How many steps did I do in the last 7 days?', TODAY)).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['steps'],
        startDate: '2026-07-22',
        endDate: TODAY
      },
      reason: 'recent-range'
    })
  })

  test('leaves interpretive and ambiguous requests to the full agent', () => {
    expect(fastHealthPlanForRequest('Could creatine be affecting my sleep?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('Was my resting heart rate high yesterday?', TODAY)).toBeNull()
    expect(
      fastHealthPlanForRequest('Is my HRV correlated with my sleep over the last 30 days?', TODAY)
    ).toBeNull()
    expect(fastHealthPlanForRequest('Compare my recent health', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('Tell me about my workouts', TODAY)).toBeNull()
  })
})

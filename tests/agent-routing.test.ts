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

  test('keeps one valid ISO date on the fast path', () => {
    expect(fastHealthPlanForRequest('How many steps did I do on 2026-07-03?', TODAY)).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['steps'],
        startDate: '2026-07-03',
        endDate: '2026-07-03'
      },
      reason: 'exact-value'
    })
  })

  test('falls back when date language is present but not fully parsed', () => {
    expect(fastHealthPlanForRequest('How many steps did I do on July 3rd?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do last Tuesday?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do in March?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do on 2026-02-30?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('What was my HRV yestarday?', TODAY)).toBeNull()
  })

  test('falls back when recognised and unparsed date expressions are mixed', () => {
    expect(
      fastHealthPlanForRequest('What were my steps yesterday and on July 3rd?', TODAY)
    ).toBeNull()
    expect(
      fastHealthPlanForRequest('Show me my steps this week and on March 2nd', TODAY)
    ).toBeNull()
    expect(fastHealthPlanForRequest('Show my steps last week and 3 weeks ago', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('Show my steps yesterday and 3 days ago', TODAY)).toBeNull()
    expect(
      fastHealthPlanForRequest('Show my steps on 2026-07-03 and yesterday', TODAY)
    ).toBeNull()
  })

  test('falls back when a non-comparison request contains multiple recognised periods', () => {
    expect(fastHealthPlanForRequest('Show my steps yesterday and today', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('Show my steps this week and last week', TODAY)).toBeNull()
  })

  test('does not treat ambiguous date abbreviations as ordinary English', () => {
    expect(fastHealthPlanForRequest('How many steps may I have logged yesterday?', TODAY)).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['steps'],
        startDate: '2026-07-27',
        endDate: '2026-07-27'
      },
      reason: 'exact-value'
    })
    expect(
      fastHealthPlanForRequest('How many steps did I take after I sat down yesterday?', TODAY)
    ).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['steps'],
        startDate: '2026-07-27',
        endDate: '2026-07-27'
      },
      reason: 'exact-value'
    })
    expect(fastHealthPlanForRequest('How many steps did I do in May?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do on Mon?', TODAY)).toBeNull()
  })

  test('does not silently truncate ranges beyond the health-tool limit', () => {
    expect(fastHealthPlanForRequest('How many steps did I do in the last 365 days?', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('How many steps did I do in the last 0 days?', TODAY)).toBeNull()
  })

  test('leaves comparisons to the full agent until their period semantics can be preserved', () => {
    expect(fastHealthPlanForRequest('Compare my steps this week with last week', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('Compare my steps yesterday with last week', TODAY)).toBeNull()
    expect(
      fastHealthPlanForRequest('How did my sleep yesterday compare to the night before?', TODAY)
    ).toBeNull()
    expect(
      fastHealthPlanForRequest('How many steps yesterday and how did that compare to my average?', TODAY)
    ).toBeNull()
    expect(fastHealthPlanForRequest('Compare my steps on July 3rd and July 10th', TODAY)).toBeNull()
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

  test('keeps every requested metric in mixed sleep questions', () => {
    expect(fastHealthPlanForRequest('What were my sleep and steps yesterday?', TODAY)).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['steps', 'sleepMinutes', 'sleepEfficiency'],
        startDate: '2026-07-27',
        endDate: '2026-07-27'
      },
      reason: 'exact-value'
    })
    expect(
      fastHealthPlanForRequest('Show my sleep stages and steps yesterday', TODAY)
    ).toBeNull()
  })

  test('does not confuse unrelated words or body fat with sleep and dietary fat', () => {
    expect(fastHealthPlanForRequest('Show me my embed yesterday', TODAY)).toBeNull()
    expect(fastHealthPlanForRequest('What was my body fat yesterday?', TODAY)).toEqual({
      tool: 'query_daily_metrics',
      args: {
        metrics: ['bodyFatPct'],
        startDate: '2026-07-27',
        endDate: '2026-07-27'
      },
      reason: 'exact-value'
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

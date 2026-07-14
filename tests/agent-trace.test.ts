import { describe, expect, test } from 'bun:test'
import {
  formatAgentTraceEvent,
  summarizeToolArguments,
  summarizeToolResult,
  type AgentTraceEvent
} from '../src/main/agent-trace'

describe('agent execution tracing', () => {
  test('shows whether hosted research is available for a run', () => {
    const event: AgentTraceEvent = {
      type: 'research_policy',
      traceId: 'trace123',
      chatId: 'chat1234',
      runId: 'run12345',
      sequence: 1,
      elapsedMs: 2,
      maxCalls: 3,
      maxAttempts: 4,
      suggestedSearchTurns: 2,
      reason: 'external-guidance'
    }
    expect(formatAgentTraceEvent(event)).toBe(
      '[AI trace123 +2ms] Web research available · up to 3 successful calls / 4 attempts · suggested depth 2 · external-guidance'
    )
  })

  test('formats a concise timeline entry', () => {
    const event: AgentTraceEvent = {
      type: 'tool_completed',
      traceId: 'trace123',
      chatId: 'chat1234',
      runId: 'run12345',
      sequence: 4,
      elapsedMs: 1_250,
      turn: 2,
      name: 'query_sleep',
      callId: 'call-123456',
      durationMs: 400,
      bytes: 2_048,
      result: { source: 'live', nights: 7 }
    }

    expect(formatAgentTraceEvent(event)).toBe(
      '[AI trace123 +1.3s] Tool completed · query_sleep · 400ms · 2048 bytes · {"source":"live","nights":7}'
    )
  })

  test('only logs approved tool argument metadata', () => {
    expect(
      summarizeToolArguments('query_daily_metrics', {
        metrics: ['steps', 'restingHeartRate'],
        startDate: '2026-07-01',
        endDate: '2026-07-07',
        accessToken: 'must-not-appear',
        rawHealthData: { steps: 12_345 }
      })
    ).toEqual({
      metrics: ['steps', 'restingHeartRate'],
      startDate: '2026-07-01',
      endDate: '2026-07-07'
    })
    expect(
      summarizeToolArguments('research_web', {
        query: 'Do people with HRV around 32 ms report short sleep?'
      })
    ).toEqual({ query: 'Do people with HRV around 32 ms report short sleep?' })
  })

  test('summarizes result shape without exposing health measurements', () => {
    const summary = summarizeToolResult('query_daily_metrics', {
      source: 'live',
      requestedRange: { start: '2026-07-01', end: '2026-07-07' },
      units: { steps: 'count' },
      observations: { steps: 7 },
      days: { '2026-07-01': { steps: 12_345 } }
    })

    expect(summary).toEqual({
      source: 'live',
      range: { start: '2026-07-01', end: '2026-07-07' },
      metrics: ['steps'],
      observations: { steps: 7 }
    })
    expect(JSON.stringify(summary)).not.toContain('12345')
  })

  test('counts presentation requests without logging their generated copy', () => {
    expect(
      summarizeToolArguments('present_health_data', {
        overviews: [{ title: 'Private overview title' }],
        metricCards: [{ title: 'Private generated title' }],
        comparisons: [{ title: 'Another private title' }],
        charts: [],
        sleepCards: [{ date: '2026-07-11' }],
        nutritionCards: [{ scope: 'meal' }],
        workouts: []
      })
    ).toEqual({
      overviews: 1,
      metricCards: 1,
      comparisons: 1,
      charts: 0,
      sleepCards: 1,
      nutritionCards: 1,
      workouts: 0
    })
  })
})

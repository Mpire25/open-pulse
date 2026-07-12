import { describe, expect, test } from 'bun:test'
import {
  assistantVisualLayout,
  orderAssistantVisuals
} from '../src/shared/assistant-layout'
import type { AssistantChartPart, AssistantMetricCardPart } from '../src/shared/types'

function metricCard(id: string): AssistantMetricCardPart {
  return {
    id,
    type: 'metric-card',
    metric: 'steps',
    date: '2026-07-12',
    value: 10_000,
    source: 'live',
    action: {
      type: 'open-metric',
      view: 'activity',
      metric: 'steps',
      date: '2026-07-12',
      range: 'D'
    }
  }
}

function chart(id: string): AssistantChartPart {
  return {
    id,
    type: 'trend-chart',
    title: 'Steps trend',
    metric: 'steps',
    startDate: '2026-07-06',
    endDate: '2026-07-12',
    points: [],
    observations: 0,
    source: 'live',
    action: {
      type: 'open-metric',
      view: 'activity',
      metric: 'steps',
      date: '2026-07-12',
      range: 'W'
    }
  }
}

describe('assistant visual layouts', () => {
  test('keeps the compact assistant strictly single-column', () => {
    expect(assistantVisualLayout([metricCard('one'), metricCard('two')], true)).toBe('stack')
  })

  test('pairs two compact cards on the full Assistant page', () => {
    expect(assistantVisualLayout([metricCard('one'), metricCard('two')], false)).toBe('pair')
  })

  test('uses a primary and supporting composition for one chart and one compact card', () => {
    const parts = [metricCard('support'), chart('primary')]
    const layout = assistantVisualLayout(parts, false)

    expect(layout).toBe('primary-supporting')
    expect(orderAssistantVisuals(parts, layout).map((part) => part.id)).toEqual(['primary', 'support'])
  })

  test('does not squeeze two information-dense visuals beside each other', () => {
    expect(assistantVisualLayout([chart('one'), chart('two')], false)).toBe('stack')
  })
})

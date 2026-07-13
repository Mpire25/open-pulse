import { describe, expect, test } from 'bun:test'
import {
  researchCompletionAction,
  researchPolicyForRequest,
  sanitizeWebSearchAction,
  webResearchAvailable
} from '../src/main/agent-research'

describe('assistant web research policy', () => {
  test('keeps personal-data-only questions offline', () => {
    expect(researchPolicyForRequest('Compare my steps this week with last week')).toEqual({
      enabled: false,
      maxSearchTurns: 0,
      reason: 'none'
    })
    expect(researchPolicyForRequest('Is my resting heart rate trending up or down?').enabled).toBe(false)
  })

  test('enables bounded research for external and explicit requests', () => {
    expect(researchPolicyForRequest('What do NHS guidelines recommend for weekly activity?')).toEqual({
      enabled: true,
      maxSearchTurns: 1,
      reason: 'external-guidance'
    })
    expect(researchPolicyForRequest('Research my overall health compared with NHS ideals')).toEqual({
      enabled: true,
      maxSearchTurns: 2,
      reason: 'explicit'
    })
    expect(researchPolicyForRequest('Is this result something I should worry about?')).toMatchObject({
      enabled: true,
      reason: 'medical-guidance'
    })
    expect(researchPolicyForRequest('Is my resting heart rate normal?')).toMatchObject({
      enabled: true,
      reason: 'external-guidance'
    })
    expect(researchPolicyForRequest('What is the latest Fitbit feature information?')).toMatchObject({
      enabled: true,
      reason: 'explicit'
    })
  })

  test('requires one repair pass for searched answers without citations', () => {
    expect(researchCompletionAction(0, 0, false, true)).toBe('complete')
    expect(researchCompletionAction(1, 2, false, true)).toBe('complete')
    expect(researchCompletionAction(1, 0, false, true)).toBe('repair-citations')
    expect(researchCompletionAction(1, 0, true, true)).toBe('refuse-uncited')
    expect(researchCompletionAction(1, 0, false, false)).toBe('refuse-uncited')
  })

  test('removes web access when disabled, exhausted, or synthesizing', () => {
    const enabled = researchPolicyForRequest('Look up the latest NHS recommendation')
    expect(webResearchAvailable(enabled, 0, false)).toBe(true)
    expect(webResearchAvailable(enabled, enabled.maxSearchTurns, false)).toBe(false)
    expect(webResearchAvailable(enabled, 0, true)).toBe(false)
    expect(webResearchAvailable(researchPolicyForRequest('How many steps yesterday?'), 0, false)).toBe(false)
  })

  test('redacts measurements and identifiers from traced search queries', () => {
    expect(
      sanitizeWebSearchAction({
        type: 'search',
        queries: ['NHS resting heart rate 68 bpm on 2026-07-11', 'person@example.com healthy range']
      })
    ).toEqual({
      action: 'search',
      query: 'NHS resting heart rate # bpm on [date] | [email] healthy range'
    })
  })
})

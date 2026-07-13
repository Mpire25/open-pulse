import { describe, expect, test } from 'bun:test'
import {
  isolatedResearchPrompt,
  RESEARCH_TOOL,
  researchPolicyForRequest,
  sanitizeResearchQuery,
  sanitizeWebSearchAction
} from '../src/main/agent-research'

describe('assistant web research policy', () => {
  test('exposes one free-form brokered query instead of a topic enum', () => {
    expect(RESEARCH_TOOL.name).toBe('research_web')
    expect(RESEARCH_TOOL.parameters).toMatchObject({
      properties: { query: { type: 'string', minLength: 1, maxLength: 700 } },
      required: ['query'],
      additionalProperties: false
    })
  })

  test('makes brokered research available without forcing it for personal-data questions', () => {
    expect(researchPolicyForRequest('Compare my steps this week with last week')).toEqual({
      enabled: true,
      maxSearchTurns: 1,
      reason: 'model-directed'
    })
    expect(researchPolicyForRequest('Is my resting heart rate trending up or down?')).toMatchObject({
      enabled: true,
      reason: 'model-directed'
    })
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
    expect(researchPolicyForRequest('Can a calorie deficit affect sleep?')).toMatchObject({
      enabled: true,
      reason: 'model-directed'
    })
    expect(researchPolicyForRequest('Could retatrutide make sleep worse?')).toMatchObject({
      enabled: true,
      reason: 'model-directed'
    })
    expect(researchPolicyForRequest('Could creatine affect my sleep?')).toMatchObject({
      enabled: true,
      reason: 'model-directed'
    })
  })

  test('preserves specific medical context and useful numbers', () => {
    const prompt = isolatedResearchPrompt(
      'Is 1 mg retatrutide a high dose, and do people with HRV around 32 ms report sleeping only 7 hours?'
    )

    expect(prompt).toContain('1 mg retatrutide')
    expect(prompt).toContain('HRV around 32 ms')
    expect(prompt).toContain('7 hours')
  })

  test('keeps arbitrary niche subjects instead of reducing them to a topic list', () => {
    const prompt = isolatedResearchPrompt(
      'Search Reddit for vivid dreams when combining ashwagandha with enclomiphene during a calorie deficit'
    )

    expect(prompt).toContain('Reddit')
    expect(prompt).toContain('ashwagandha')
    expect(prompt).toContain('enclomiphene')
    expect(prompt).toContain('calorie deficit')
  })

  test('removes direct identifiers and credentials without stripping health detail', () => {
    const query = sanitizeResearchQuery(
      'Email matt@example.com or call +44 7700 900123. Token sk-abcdefghijklmnop. Is 1 mg retatrutide high?'
    )

    expect(query).toContain('[email removed]')
    expect(query).toContain('[phone removed]')
    expect(query).toContain('[credential removed]')
    expect(query).toContain('1 mg retatrutide')
    expect(query).not.toContain('matt@example.com')
    expect(query).not.toContain('7700 900123')
    expect(query).not.toContain('sk-abcdefghijklmnop')
    expect(sanitizeResearchQuery('Was guidance different on 2026-07-14?')).toContain('2026-07-14')
  })

  test('redacts measurements and identifiers from diagnostic traces', () => {
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

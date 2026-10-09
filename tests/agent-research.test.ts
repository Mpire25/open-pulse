import { describe, expect, test } from 'bun:test'
import {
  isolatedResearchPrompt,
  RESEARCH_TOOL,
  sanitizeResearchQuery
} from '../src/main/agent-research'

describe('assistant web research broker', () => {
  test('exposes a free-form brokered query instead of a topic enum', () => {
    expect(RESEARCH_TOOL.name).toBe('research_web')
    expect(RESEARCH_TOOL.parameters).toMatchObject({
      properties: { query: { type: 'string', minLength: 1, maxLength: 700 } },
      required: ['query'],
      additionalProperties: false
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

})

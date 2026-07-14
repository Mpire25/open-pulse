import { describe, expect, test } from 'bun:test'
import { interruptedTurnText } from '../src/shared/chat'

describe('assistant interruption copy', () => {
  test('preserves partial output and clearly marks it as interrupted', () => {
    expect(interruptedTurnText('Partial answer.  ', 'Response stopped.')).toBe(
      'Partial answer.\n\n_Response stopped._'
    )
  })

  test('uses the interruption message when no output arrived', () => {
    expect(interruptedTurnText('', 'Response stopped.')).toBe('Response stopped.')
  })
})

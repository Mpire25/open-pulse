import { describe, expect, test } from 'bun:test'
import { interruptedTurnState } from '../src/shared/chat'

describe('assistant interruption copy', () => {
  test('preserves partial output and clearly marks it as interrupted', () => {
    expect(interruptedTurnState('Partial answer.  ', 'Response stopped.')).toEqual({
      text: 'Partial answer.\n\n_Response stopped._',
      transient: false
    })
  })

  test('marks a content-free interruption as transient history', () => {
    expect(interruptedTurnState('', 'Response stopped.')).toEqual({
      text: 'Response stopped.',
      transient: true
    })
  })
})

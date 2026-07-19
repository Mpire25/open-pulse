import { describe, expect, test } from 'bun:test'
import {
  HEALTH_CANCELLED,
  healthError,
  healthWireArgs,
  splitHealthWireArgs,
  unwrapHealthResult
} from '../src/shared/health-ipc'

describe('health IPC protocol', () => {
  test('preserves domain argument order and appends cancellation metadata', () => {
    const metrics = ['steps']
    const wireArgs = healthWireArgs([metrics, '2026-07-01', '2026-07-07', false], 'request-1')

    expect(wireArgs[0]).toBe(metrics)
    expect(splitHealthWireArgs(wireArgs)).toEqual({
      args: [metrics, '2026-07-01', '2026-07-07', false],
      requestId: 'request-1'
    })
  })

  test('accepts legacy callers without consuming their final argument', () => {
    const legacyArgs = [['steps'], '2026-07-01', '2026-07-07']
    expect(splitHealthWireArgs(legacyArgs)).toEqual({ args: legacyArgs, requestId: null })
  })

  test('rethrows structured health failures with only the user-facing message', () => {
    const result = healthError('Google Health needs to be reconnected before data can sync.')

    expect(() => unwrapHealthResult(result)).toThrow(
      'Google Health needs to be reconnected before data can sync.'
    )
    try {
      unwrapHealthResult(result)
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('Google Health needs to be reconnected before data can sync.')
    }
  })

  test('retains cancellation semantics for structured health results', () => {
    try {
      unwrapHealthResult(HEALTH_CANCELLED)
      throw new Error('Expected cancellation')
    } catch (error) {
      expect(error).toBeInstanceOf(DOMException)
      expect((error as DOMException).name).toBe('AbortError')
    }
  })
})

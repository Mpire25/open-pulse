import { describe, expect, test } from 'bun:test'
import { healthWireArgs, splitHealthWireArgs } from '../src/shared/health-ipc'

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
})

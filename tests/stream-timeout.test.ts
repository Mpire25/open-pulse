import { describe, expect, test } from 'bun:test'
import { createStreamTimeout, StreamTimeoutError } from '../src/main/stream-timeout'

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
}

describe('stream activity timeouts', () => {
  test('times out while waiting for the first response bytes', async () => {
    const parent = new AbortController()
    const timeout = createStreamTimeout(parent.signal, {
      firstByteMs: 10,
      idleMs: 50,
      label: 'Test stream'
    })

    await waitForAbort(timeout.signal)

    expect(timeout.signal.reason).toBeInstanceOf(StreamTimeoutError)
    expect((timeout.signal.reason as StreamTimeoutError).phase).toBe('first-byte')
    timeout.dispose()
  })

  test('switches to an idle timeout after activity', async () => {
    const parent = new AbortController()
    const timeout = createStreamTimeout(parent.signal, {
      firstByteMs: 10,
      idleMs: 20,
      label: 'Test stream'
    })
    timeout.activity()

    await waitForAbort(timeout.signal)

    expect(timeout.signal.reason).toBeInstanceOf(StreamTimeoutError)
    expect((timeout.signal.reason as StreamTimeoutError).phase).toBe('idle')
    timeout.dispose()
  })

  test('propagates parent cancellation instead of reporting a timeout', () => {
    const parent = new AbortController()
    const reason = new Error('User stopped the run.')
    const timeout = createStreamTimeout(parent.signal, {
      firstByteMs: 50,
      idleMs: 50,
      label: 'Test stream'
    })

    parent.abort(reason)

    expect(timeout.signal.reason).toBe(reason)
    expect(timeout.normalizeError(new Error('fetch aborted'))).toBe(reason)
    timeout.dispose()
  })
})

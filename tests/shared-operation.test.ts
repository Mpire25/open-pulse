import { describe, expect, test } from 'bun:test'
import { createSharedOperation, waitForSharedOperation } from '../src/main/shared-operation'

describe('shared operation cancellation', () => {
  test('canceling one consumer does not cancel another active consumer', async () => {
    let finish!: (value: string) => void
    const operation = createSharedOperation(
      () => new Promise<string>((resolve) => {
        finish = resolve
      })
    )
    const firstController = new AbortController()
    const secondController = new AbortController()
    const first = waitForSharedOperation(operation, firstController.signal)
    const second = waitForSharedOperation(operation, secondController.signal)

    firstController.abort()
    finish('complete')

    await expect(first).rejects.toHaveProperty('name', 'AbortError')
    await expect(second).resolves.toBe('complete')
    expect(operation.controller.signal.aborted).toBe(false)
  })

  test('aborts the underlying work after its final consumer cancels', async () => {
    const operation = createSharedOperation(
      (signal) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true }
        )
      })
    )
    const controller = new AbortController()
    const result = waitForSharedOperation(operation, controller.signal)

    controller.abort()

    await expect(result).rejects.toHaveProperty('name', 'AbortError')
    expect(operation.controller.signal.aborted).toBe(true)
  })
})

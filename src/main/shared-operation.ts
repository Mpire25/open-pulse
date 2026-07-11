export interface SharedOperation<T> {
  controller: AbortController
  promise: Promise<T>
  consumers: number
  settled: boolean
}

function abortError(): Error {
  return new DOMException('The request was cancelled.', 'AbortError')
}

export function createSharedOperation<T>(run: (signal: AbortSignal) => Promise<T>): SharedOperation<T> {
  const controller = new AbortController()
  const operation: SharedOperation<T> = {
    controller,
    promise: undefined as unknown as Promise<T>,
    consumers: 0,
    settled: false
  }
  operation.promise = run(controller.signal).finally(() => {
    operation.settled = true
  })
  return operation
}

export function waitForSharedOperation<T>(
  operation: SharedOperation<T>,
  signal?: AbortSignal
): Promise<T> {
  operation.consumers += 1

  return new Promise<T>((resolve, reject) => {
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      operation.consumers -= 1
      signal?.removeEventListener('abort', onAbort)
      if (!operation.settled && operation.consumers === 0) operation.controller.abort()
    }
    const onAbort = (): void => {
      release()
      reject(abortError())
    }

    operation.promise.then(
      (value) => {
        release()
        resolve(value)
      },
      (error: unknown) => {
        release()
        reject(error)
      }
    )

    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function abortSharedOperations(operations: Iterable<SharedOperation<unknown>>): void {
  for (const operation of new Set(operations)) operation.controller.abort()
}

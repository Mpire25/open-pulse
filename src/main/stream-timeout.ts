export type StreamTimeoutPhase = 'first-byte' | 'idle'

export class StreamTimeoutError extends Error {
  readonly phase: StreamTimeoutPhase

  constructor(phase: StreamTimeoutPhase, message: string) {
    super(message)
    this.name = 'StreamTimeoutError'
    this.phase = phase
  }
}

interface StreamTimeoutOptions {
  firstByteMs: number
  idleMs: number
  label: string
}

export interface StreamTimeout {
  signal: AbortSignal
  activity: () => void
  dispose: () => void
  normalizeError: (error: unknown) => Error
}

function durationLabel(milliseconds: number): string {
  if (milliseconds >= 60_000 && milliseconds % 60_000 === 0) {
    const minutes = milliseconds / 60_000
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }
  const seconds = Math.max(1, Math.round(milliseconds / 1_000))
  return `${seconds} second${seconds === 1 ? '' : 's'}`
}

export function createStreamTimeout(
  parentSignal: AbortSignal,
  options: StreamTimeoutOptions
): StreamTimeout {
  const controller = new AbortController()
  let phase: StreamTimeoutPhase = 'first-byte'
  let timer: ReturnType<typeof setTimeout> | undefined

  const duration = (): number => phase === 'first-byte' ? options.firstByteMs : options.idleMs
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const message = phase === 'first-byte'
        ? `${options.label} did not start responding within ${durationLabel(options.firstByteMs)}.`
        : `${options.label} stopped responding for ${durationLabel(options.idleMs)}.`
      controller.abort(new StreamTimeoutError(phase, message))
    }, duration())
  }
  const onParentAbort = (): void => controller.abort(parentSignal.reason)

  if (parentSignal.aborted) onParentAbort()
  else parentSignal.addEventListener('abort', onParentAbort, { once: true })
  if (!controller.signal.aborted) schedule()

  return {
    signal: controller.signal,
    activity: () => {
      if (controller.signal.aborted) return
      phase = 'idle'
      schedule()
    },
    dispose: () => {
      if (timer) clearTimeout(timer)
      parentSignal.removeEventListener('abort', onParentAbort)
    },
    normalizeError: (error) => {
      if (parentSignal.aborted) {
        return parentSignal.reason instanceof Error
          ? parentSignal.reason
          : new Error('Response cancelled.')
      }
      if (controller.signal.aborted && controller.signal.reason instanceof Error) {
        return controller.signal.reason
      }
      return error instanceof Error ? error : new Error(String(error))
    }
  }
}

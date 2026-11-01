import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { StreamingText } from '@/lib/streaming-text'

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function subscribeReducedMotion(changed: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', changed)
  return () => query.removeEventListener('change', changed)
}

export function useStreamingText(source: string, streaming: boolean): { text: string; animate: boolean } {
  const reduceMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotion, () => false)
  const [pacing] = useState(() => new StreamingText(source, streaming && !reduceMotion))
  const [frame, setFrame] = useState(() => ({ text: pacing.text, animate: streaming && !reduceMotion }))
  const request = useRef<number | null>(null)

  useLayoutEffect(() => {
    const animate = pacing.update(source, streaming, !reduceMotion)
    setFrame((previous) => previous.text === pacing.text && previous.animate === animate
      ? previous : { text: pacing.text, animate })
    if (!pacing.pending || request.current !== null) return
    let last = performance.now()
    const tick = (now: number): void => {
      const pending = pacing.advance(Math.min(0.064, Math.max(0, (now - last) / 1000)))
      last = now
      setFrame((previous) => previous.text === pacing.text ? previous : { text: pacing.text, animate: true })
      request.current = pending ? requestAnimationFrame(tick) : null
    }
    request.current = requestAnimationFrame(tick)
  }, [pacing, source, streaming, reduceMotion])

  useEffect(() => () => {
    if (request.current !== null) cancelAnimationFrame(request.current)
    request.current = null
  }, [])

  return frame
}

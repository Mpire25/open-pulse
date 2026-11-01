import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import React, { act, StrictMode } from 'react'

const dom = new Window({ url: 'http://localhost:49183' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Document', 'SVGElement', 'MutationObserver', 'getComputedStyle']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom : (dom as unknown as Record<string, unknown>)[name] })
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let clock = 0
let nextId = 0
const frames = new Map<number, FrameRequestCallback>()
let reduceMotion = false
const motionListeners = new Set<() => void>()
Object.defineProperty(performance, 'now', { configurable: true, value: () => clock })
Object.assign(dom, { matchMedia: () => ({ get matches() { return reduceMotion }, addEventListener: (_event: string, listener: () => void) => motionListeners.add(listener), removeEventListener: (_event: string, listener: () => void) => motionListeners.delete(listener) }) })
Object.assign(globalThis, {
  requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId },
  cancelAnimationFrame: (id: number) => { frames.delete(id) }
})
const { createRoot } = await import('react-dom/client')
const { Markdownish } = await import('../../src/renderer/src/components/Markdownish')
let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(async () => {
  clock = 0
  frames.clear()
  reduceMotion = false
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
afterAll(async () => { await dom.happyDOM.close() })

async function render(text: string, streaming = true): Promise<void> {
  await act(async () => root.render(<StrictMode><Markdownish text={text} streaming={streaming} /></StrictMode>))
}
async function advance(milliseconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 16) {
    clock += 16
    const pending = [...frames.values()]
    frames.clear()
    await act(async () => { for (const callback of pending) callback(clock) })
  }
}

test('steady reveal survives rapid chunks and completion preserves formatting and word identity', async () => {
  await render('One two three ')
  expect(container.textContent).toBe('')
  await render('One two three four ')
  await render('One two three four five ')
  await advance(48)
  expect(container.textContent).toBe('One')
  const firstWord = container.querySelector('.assistant-stream-word')
  const delay = firstWord?.getAttribute('style')
  await advance(100)
  expect(container.querySelector('.assistant-stream-word')).toBe(firstWord)
  expect(firstWord?.getAttribute('style')).toBe(delay)
  const source = 'One two three four five **bold** [link](https://example.com) `code`\n\n```js\nconst n = 1\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'
  await render(source)
  await render(source, false)
  await advance(256)
  expect(container.querySelector('strong')?.textContent).toBe('bold')
  expect(container.querySelector('a')?.textContent).toBe('link')
  expect(container.querySelector('a .assistant-stream-word')).toBeNull()
  expect(container.querySelector('code .assistant-stream-word')).toBeNull()
  expect(container.querySelector('pre')?.textContent).toContain('const n = 1')
  expect(container.querySelectorAll('td')).toHaveLength(2)
  expect(container.textContent).not.toContain('**')
  expect(frames.size).toBe(0)
})

test('history shows immediately; replacing a live response discards the pending frame', async () => {
  await render('Saved **answer**', false)
  expect(container.textContent).toBe('Saved answer')
  expect(container.querySelector('.assistant-stream-word')).toBeNull()
  await render('Saved **answer** pending words that must disappear ')
  await advance(32)
  await render('Corrected reply ')
  expect(container.textContent).toBe('Corrected reply')
  await advance(300)
  expect(container.textContent).toBe('Corrected reply')
  expect(frames.size).toBe(0)
})

for (const marker of ['**', '*', '~~', '***']) {
  test(`closing ${marker} preserves settled word fades and still fades new words`, async () => {
    const prefix = `${marker}These words were already visible for a full second`
    await render(prefix)
    await advance(1000)
    const settledWords = container.querySelectorAll('.assistant-stream-word').length

    await render(prefix + marker + ' ')
    await advance(48)
    const words = [...container.querySelectorAll<HTMLElement>('.assistant-stream-word')]
    expect(container.textContent).toBe('These words were already visible for a full second')
    for (const word of words.slice(0, settledWords)) {
      expect(Number.parseFloat(word.style.animationDelay)).toBeLessThanOrEqual(-180)
    }
    // The final word was held until its closing delimiter arrived.
    expect(Number.parseFloat(words.at(-1)!.style.animationDelay)).toBeGreaterThan(-180)
  })
}

test('repeated words retain distinct fade times when emphasis resolves', async () => {
  await render('echo **echo echo')
  await advance(1000)
  const first = container.querySelector<HTMLElement>('.assistant-stream-word')!
  const firstStyle = first.getAttribute('style')
  await render('echo **echo echo** echo ')
  await advance(96)
  const words = [...container.querySelectorAll<HTMLElement>('.assistant-stream-word')]
  expect(words.map((word) => word.textContent)).toEqual(['echo', 'echo', 'echo', 'echo'])
  expect(words[0]).toBe(first)
  expect(words[0].getAttribute('style')).toBe(firstStyle)
  expect(Number.parseFloat(words[1].style.animationDelay)).toBeLessThanOrEqual(-180)
  for (const word of words.slice(2)) {
    expect(Number.parseFloat(word.style.animationDelay)).toBeGreaterThan(-180)
  }
})

test('resolving emphasis preserves the progress of a word that is still fading', async () => {
  await render('**one two')
  await advance(48)
  await render('**one two** ')
  await advance(32)
  const first = container.querySelector<HTMLElement>('strong .assistant-stream-word')!
  expect(first.textContent).toBe('one')
  const delay = Number.parseFloat(first.style.animationDelay)
  expect(delay).toBeLessThan(0)
  expect(delay).toBeGreaterThan(-180)
})

test('Reduce Motion flushes pending text and disables fades during the stream', async () => {
  const source = 'A long reply still waiting to be revealed '
  await render(source)
  await advance(32)
  expect(container.textContent?.length).toBeLessThan(source.length)
  await act(async () => { reduceMotion = true; for (const listener of motionListeners) listener() })
  expect(container.textContent).toBe(source.trimEnd())
  expect(container.querySelector('.assistant-stream-word')).toBeNull()
  await advance(32)
  expect(frames.size).toBe(0)
})

test('unmount cancels the display task', async () => {
  await render('Pending words with lots more to display ')
  expect(frames.size).toBe(1)
  await act(async () => root.render(null))
  expect(frames.size).toBe(0)
})

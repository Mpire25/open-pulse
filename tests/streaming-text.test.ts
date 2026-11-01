import { expect, test } from 'bun:test'
import { StreamingText } from '../src/renderer/src/lib/streaming-text'

test('paces complete words, waits for partial words, and drains after completion', () => {
  const pacing = new StreamingText('', true)
  pacing.update('One two thr', true)
  pacing.advance(0.04)
  expect(pacing.text).toBe('One')
  pacing.advance(0.04)
  expect(pacing.text).toBe('One two')
  expect(pacing.pending).toBe(false)
  pacing.update('One two three', false)
  pacing.advance(0.04)
  expect(pacing.text).toBe('One two three')
  expect(pacing.pending).toBe(false)
})

test('bursts catch up and the final buffer drains within a quarter second', () => {
  const source = 'word '.repeat(300)
  const pacing = new StreamingText('', true)
  pacing.update(source, true)
  pacing.advance(0.016)
  expect(pacing.text.split(' ').length).toBeGreaterThan(5)
  expect(pacing.text.length).toBeLessThan(source.length)
  pacing.update(source, false)
  for (let index = 0; index < 16; index++) pacing.advance(0.016)
  expect(pacing.text).toBe(source)
})

test('history, replacements, and Reduce Motion show directly without stale pending text', () => {
  const pacing = new StreamingText('Saved **answer**')
  expect(pacing.update('Saved **answer**', false)).toBe(false)
  expect(pacing.text).toBe('Saved **answer**')
  pacing.update('Saved **answer** more incoming words ', true)
  expect(pacing.update('Corrected answer', true)).toBe(false)
  pacing.advance(1)
  expect(pacing.text).toBe('Corrected answer')
  pacing.update('Corrected answer with more text ', true)
  expect(pacing.update('Corrected answer with more text ', true, false)).toBe(false)
  expect(pacing.text).toBe('Corrected answer with more text ')
  expect(pacing.pending).toBe(false)
})

test('Unicode stays intact and unbroken CJK and URLs reveal before EOF', () => {
  for (const source of ['👨‍👩‍👧‍👦 cafe\u0301 hello ', '这是没有空格的流式回复'.repeat(30), 'https://example.com/' + 'a'.repeat(100)]) {
    const pacing = new StreamingText('', true)
    pacing.update(source, true)
    pacing.advance(0.04)
    expect(pacing.text.length).toBeGreaterThan(0)
    expect(source.startsWith(pacing.text)).toBe(true)
    const boundaries = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source)]
      .map((item) => item.index + item.segment.length)
    expect(boundaries).toContain(pacing.text.length)
    pacing.update(source, false)
    for (let index = 0; index < 16; index++) pacing.advance(0.016)
    expect(pacing.text).toBe(source)
  }
})

test('a chunk ending mid-emoji cannot reveal a dangling surrogate at the long-word boundary', () => {
  const pacing = new StreamingText('', true)
  pacing.update('abcdefghijk\ud83d', true)
  pacing.advance(0.1)
  expect(pacing.text).toBe('')
  pacing.update('abcdefghijk👨‍👩‍👧‍👦 ', true)
  pacing.advance(0.04)
  expect(pacing.text).toBe('abcdefghijk👨‍👩‍👧‍👦')
  pacing.advance(0.04)
  expect(pacing.text).toBe('abcdefghijk👨‍👩‍👧‍👦 ')
})

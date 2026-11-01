const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Presentation only: the chat hook retains the full, original Markdown. */
export class StreamingText {
  static readonly wordsPerSecond = 32
  static readonly catchUpSeconds = 0.45
  static readonly drainSeconds = 0.25
  text: string
  private source: string
  private streaming = false
  private ends: number[] = []
  private next = 0
  private allowance = 0
  private drainRate = 0

  constructor(source: string, revealFromStart = false) {
    this.source = source
    this.text = revealFromStart ? '' : source
  }

  get pending(): boolean { return this.next < this.ends.length }

  /** Returns false when history, a replacement, or Reduce Motion must show directly. */
  update(source: string, streaming: boolean, animate = true): boolean {
    const wasStreaming = this.streaming
    const replaces = !source.startsWith(this.source)
    this.source = source
    this.streaming = streaming
    if (!animate || replaces || (!streaming && !wasStreaming && !this.pending)) {
      this.text = source
      this.ends = []
      this.next = 0
      this.allowance = 0
      return false
    }

    // Scan only the pending suffix, once per network update, never on fade frames.
    this.ends = []
    this.next = 0
    const suffix = source.slice(this.text.length)
    let count = 0
    let end = this.text.length
    for (const item of graphemes.segment(suffix)) {
      if (/\s/u.test(item.segment)) {
        if (count > 0) this.ends.push(end)
        count = 0
      } else {
        count++
      }
      end = this.text.length + item.index + item.segment.length
      // Bound unbroken text too, without cutting emoji or combining characters.
      // The final grapheme may still gain a surrogate, accent, or ZWJ suffix
      // in the next chunk. Keep it pending until another boundary is known.
      if (count === 12 && (end < source.length || !streaming)) {
        this.ends.push(end)
        count = 0
      }
    }
    if ((!streaming || count === 0) && end > this.text.length && this.ends.at(-1) !== end) {
      this.ends.push(end)
    }
    if (wasStreaming && !streaming) {
      this.drainRate = Math.max(StreamingText.wordsPerSecond, this.ends.length / StreamingText.drainSeconds)
    }
    return true
  }

  advance(seconds: number): boolean {
    if (!this.pending) { this.allowance = 0; return false }
    const rate = this.streaming
      ? Math.max(StreamingText.wordsPerSecond, (this.ends.length - this.next) / StreamingText.catchUpSeconds)
      : Math.max(StreamingText.wordsPerSecond, this.drainRate)
    this.allowance += rate * seconds
    while (this.allowance >= 1 && this.pending) {
      this.text = this.source.slice(0, this.ends[this.next++])
      this.allowance--
    }
    // A pause or unfinished word must not bank a burst for the next chunk.
    this.allowance = Math.min(this.allowance, 1)
    return this.pending
  }
}

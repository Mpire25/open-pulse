import type { Root, Element, Text } from 'hast'
import type { Plugin } from 'unified'

export const WORD_FADE_MS = 180

export class MarkdownWordFades {
  private previous = ''
  private words = new Map<string, number>()

  transform(tree: Root, enabled: boolean, now = performance.now()): void {
    const leaves: Array<{ parent: Root | Element; node: Text; excluded: boolean }> = []
    const collect = (parent: Root | Element, excluded = false): void => {
      for (const node of parent.children) {
        if (node.type === 'text') leaves.push({ parent, node, excluded })
        else if (node.type === 'element') collect(node, excluded || ['a', 'code', 'pre', 'blockquote'].includes(node.tagName))
      }
    }
    collect(tree)
    const rendered = leaves.map(({ node }) => node.value).join('')
    let common = 0
    while (common < this.previous.length && this.previous[common] === rendered[common]) common++
    const words = new Map<string, number>()
    const occurrences = new Map<string, number>()
    let offset = 0
    for (const { parent, node, excluded } of leaves) {
      const replacements: Array<Text | Element> = []
      for (const match of node.value.matchAll(/\s+|\S+/gu)) {
        const value = match[0]
        const position = offset + match.index
        if (/^\s/u.test(value)) {
          replacements.push({ type: 'text', value })
          continue
        }
        // Resolving emphasis removes literal delimiters and shifts rendered
        // offsets. Match each word by its text and occurrence instead, retaining
        // its birth time even when Markdown reparents it into a new element.
        const identity = value.replace(/^[*_~]+|[*_~]+$/gu, '') || value
        const occurrence = occurrences.get(identity) ?? 0
        occurrences.set(identity, occurrence + 1)
        if (!enabled || excluded) {
          replacements.push({ type: 'text', value })
          continue
        }
        const key = JSON.stringify([identity, occurrence])
        const since = this.words.get(key) ?? (position < common ? now - WORD_FADE_MS : now)
        words.set(key, since)
        replacements.push({ type: 'element', tagName: 'span', properties: { dataStreamSince: since }, children: [{ type: 'text', value }] })
      }
      if (enabled && !excluded) {
        const index = parent.children.indexOf(node)
        parent.children.splice(index, 1, ...replacements)
      }
      offset += node.value.length
    }
    this.previous = rendered
    this.words = words
  }
}

export const wordFadePlugin: Plugin<[{ state: MarkdownWordFades; enabled: boolean }], Root> =
  ({ state, enabled }) => (tree) => { state.transform(tree, enabled) }

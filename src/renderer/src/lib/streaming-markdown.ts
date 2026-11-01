import type { Root, Element, Text } from 'hast'
import type { Plugin } from 'unified'

export const WORD_FADE_MS = 180

export class MarkdownWordFades {
  private previous = ''
  private words = new Map<number, { value: string; since: number }>()

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
    const words = new Map<number, { value: string; since: number }>()
    let offset = 0
    for (const { parent, node, excluded } of leaves) {
      const replacements: Array<Text | Element> = []
      for (const match of node.value.matchAll(/\s+|\S+/gu)) {
        const value = match[0]
        const position = offset + match.index
        if (!enabled || excluded || /^\s/u.test(value)) {
          replacements.push({ type: 'text', value })
          continue
        }
        const old = this.words.get(position)
        const since = old?.value === value ? old.since : position < common ? now - WORD_FADE_MS : now
        words.set(position, { value, since })
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

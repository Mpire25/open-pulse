import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

const markdown = unified().use(remarkParse).use(remarkGfm)
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

interface MarkdownNode {
  type: string
  value?: string
  children?: MarkdownNode[]
}

function plainText(node: MarkdownNode): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
      return node.value ?? ''
    case 'break':
      return ' '
    case 'html':
    case 'definition':
    case 'image':
    case 'imageReference':
    case 'footnoteDefinition':
    case 'footnoteReference':
      return ''
    default: {
      const inline = ['paragraph', 'heading', 'emphasis', 'strong', 'delete', 'link', 'linkReference'].includes(node.type)
      return (node.children ?? []).map(plainText).join(inline ? '' : ' ')
    }
  }
}

function excerpt(text: string, limit: number): string {
  // Collapse whitespace and remove invisible control/direction characters.
  const cleaned = text.replace(/\s+/gu, ' ').replace(/[\p{Cc}\p{Bidi_Control}\u200B\uFEFF]/gu, '').trim()
  const characters: string[] = []
  for (const { segment } of segments.segment(cleaned)) {
    if (characters.length === limit) return characters.slice(0, limit - 1).join('').trimEnd() + '…'
    characters.push(segment)
  }
  return cleaned
}

/** Only called for opted-in previews; never fetches links or generates a summary. */
export function responseNotificationTitle(chatTitle: string): string {
  return excerpt(chatTitle, 80) || 'OpenPulse'
}

export function responseNotificationContent(chatTitle: string, answer: string): { title: string; body: string } {
  let body = ''
  try {
    body = excerpt(plainText(markdown.parse(answer)), 240)
  } catch {
    // A malformed or excessively complex answer must not fail chat completion.
  }
  return {
    title: responseNotificationTitle(chatTitle),
    body: body || 'Your response is ready. Open the chat to view it.'
  }
}

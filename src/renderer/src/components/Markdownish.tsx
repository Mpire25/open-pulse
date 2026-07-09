import { memo } from 'react'

// Minimal, dependency-free renderer for the light Markdown the model emits:
// paragraphs, bullet lists, and **bold** / `code` inline spans.
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>
      )
    } else {
      nodes.push(
        <code key={key++} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-ink">
          {token.slice(1, -1)}
        </code>
      )
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function MarkdownishBase({ text }: { text: string }): React.JSX.Element {
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, i) => {
        const lines = block.split('\n')
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l) || l.trim() === '')
        if (isList && lines.some((l) => l.trim())) {
          return (
            <ul key={i} className="flex flex-col gap-1.5 pl-1">
              {lines
                .filter((l) => l.trim())
                .map((l, j) => (
                  <li key={j} className="flex gap-2 text-[13.5px] leading-relaxed text-ink-dim">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
                    <span>{renderInline(l.replace(/^\s*[-*]\s+/, ''))}</span>
                  </li>
                ))}
            </ul>
          )
        }
        return (
          <p key={i} className="text-[13.5px] leading-relaxed text-ink-dim">
            {renderInline(block)}
          </p>
        )
      })}
    </div>
  )
}

export const Markdownish = memo(MarkdownishBase)

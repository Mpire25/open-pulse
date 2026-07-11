import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function safeHttpsUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : ''
  } catch {
    return ''
  }
}

function MarkdownishBase({ text }: { text: string }): React.JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={safeHttpsUrl}
      components={{
        h1: ({ children }) => (
          <h1 className="display mb-2 mt-5 text-[20px] font-bold leading-tight text-ink first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="display mb-2 mt-5 text-[18px] font-bold leading-tight text-ink first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="display mb-1.5 mt-4 text-[15px] font-semibold leading-snug text-ink first:mt-0">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="display mb-1.5 mt-4 text-[13.5px] font-semibold leading-snug text-ink first:mt-0">
            {children}
          </h4>
        ),
        h5: ({ children }) => (
          <h5 className="mb-1 mt-3 text-[13px] font-semibold leading-snug text-ink first:mt-0">{children}</h5>
        ),
        h6: ({ children }) => (
          <h6 className="mb-1 mt-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-dim first:mt-0">
            {children}
          </h6>
        ),
        p: ({ children }) => <p className="my-2.5 text-[13.5px] leading-relaxed text-ink-dim first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1.5 pl-5 text-ink-dim">{children}</ul>,
        ol: ({ children }) => <ol className="my-2.5 list-decimal space-y-1.5 pl-5 text-ink-dim">{children}</ol>,
        li: ({ children }) => <li className="pl-0.5 text-[13.5px] leading-relaxed marker:text-ink-faint">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
        em: ({ children }) => <em className="italic text-ink">{children}</em>,
        del: ({ children }) => <del className="text-ink-faint decoration-ink-faint">{children}</del>,
        a: ({ href, children }) => {
          if (!href) return <span>{children}</span>
          // Web-research citations arrive as bare numbered links — render them
          // as superscript pills instead of underlined prose links.
          if (typeof children === 'string' && /^\d{1,2}$/.test(children)) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                title={href}
                className="mx-0.5 inline-flex min-w-[15px] -translate-y-[3px] items-center justify-center rounded-full bg-accent-soft px-1 py-px font-mono text-[9px] font-semibold leading-[13px] text-accent no-underline transition-colors hover:bg-accent hover:text-white"
              >
                {children}
              </a>
            )
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent underline decoration-accent/40 underline-offset-2 transition-colors hover:text-ink hover:decoration-accent"
            >
              {children}
            </a>
          )
        },
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-accent/50 pl-4 text-ink-dim">{children}</blockquote>
        ),
        hr: () => <hr className="my-5 border-0 border-t border-hairline" />,
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-xl border border-hairline bg-black/25 p-3.5 font-mono text-[12px] leading-relaxed text-ink">
            {children}
          </pre>
        ),
        code: ({ className, children }) =>
          className || String(children).includes('\n') ? (
            <code className={className}>{children}</code>
          ) : (
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-ink">{children}</code>
          ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full min-w-max border-collapse text-left text-[12.5px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-white/[0.045] text-ink">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-hairline text-ink-dim">{children}</tbody>,
        tr: ({ children }) => <tr className="divide-x divide-hairline">{children}</tr>,
        th: ({ children, style }) => (
          <th style={style} className="px-3 py-2 font-semibold leading-snug">
            {children}
          </th>
        ),
        td: ({ children, style }) => (
          <td style={style} className="px-3 py-2 align-top leading-relaxed">
            {children}
          </td>
        ),
        input: (props) => <input {...props} disabled className="mr-2 accent-accent" />,
        img: ({ src, alt }) =>
          src ? (
            <a href={src} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-2">
              {alt || 'Open image'}
            </a>
          ) : (
            <span>{alt}</span>
          )
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

export const Markdownish = memo(MarkdownishBase)

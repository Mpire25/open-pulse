import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Markdownish } from '../src/renderer/src/components/Markdownish'

describe('assistant Markdown rendering', () => {
  test('renders headings, GFM tables, lists, quotes, and fenced code', () => {
    const html = renderToStaticMarkup(
      <Markdownish
        text={`### Weekly comparison

| Metric | Result |
| --- | ---: |
| Steps | 8,420 |

1. First item
2. Second item

> General guidance, not a diagnosis.

\`\`\`text
sample output
\`\`\``}
      />
    )

    expect(html).toContain('<h3')
    expect(html).toContain('<table')
    expect(html).toContain('<thead')
    expect(html).toContain('<ol')
    expect(html).toContain('<blockquote')
    expect(html).toContain('<pre')
  })

  test('keeps HTTPS citations clickable and strips unsafe link targets', () => {
    const html = renderToStaticMarkup(
      <Markdownish text={'[NHS](https://www.nhs.uk) and [unsafe](javascript:alert(1))'} />
    )

    expect(html).toContain('href="https://www.nhs.uk/"')
    expect(html).not.toContain('javascript:')
  })
})

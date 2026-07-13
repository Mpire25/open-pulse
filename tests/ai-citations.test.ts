import { describe, expect, test } from 'bun:test'
import { addUrlCitations, countValidMarkdownCitations, countValidUrlCitations } from '../src/main/ai-citations'

describe('AI web citations', () => {
  test('adds clickable inline markers and a deduplicated source list', () => {
    const text = 'Current guidance recommends regular activity.'
    const cited = addUrlCitations(text, [
      {
        type: 'url_citation',
        start_index: 0,
        end_index: 16,
        url: 'https://www.nhs.uk/live-well/exercise/',
        title: 'NHS exercise guidance'
      },
      {
        type: 'url_citation',
        start_index: 17,
        end_index: 27,
        url: 'https://www.nhs.uk/live-well/exercise/',
        title: 'NHS exercise guidance'
      }
    ])

    expect(cited).toContain('Current guidance [1](https://www.nhs.uk/live-well/exercise/)')
    expect(cited.match(/1 · NHS exercise guidance/g)).toHaveLength(1)
  })

  test('rejects unsafe citation URLs', () => {
    const annotations = [
        {
          type: 'url_citation',
          start_index: 0,
          end_index: 6,
          url: 'javascript:alert(1)',
          title: 'Unsafe'
        },
        {
          type: 'url_citation',
          start_index: 0,
          end_index: 6,
          url: 'http://example.com',
          title: 'Insecure'
        }
      ]
    expect(addUrlCitations('Ignore this.', annotations)).toBe('Ignore this.')
    expect(countValidUrlCitations(annotations)).toBe(0)
  })

  test('still exposes a source when annotation offsets are invalid', () => {
    const cited = addUrlCitations('Useful answer.', [
      {
        type: 'url_citation',
        start_index: 500,
        end_index: 600,
        url: 'https://www.who.int/news-room/fact-sheets',
        title: 'WHO fact sheets'
      }
    ])

    expect(cited).toContain('Useful answer.')
    expect(cited).toContain('[1 · WHO fact sheets](https://www.who.int/news-room/fact-sheets)')
  })

  test('recognizes only safe HTTPS citations carried into a synthesis', () => {
    const text = [
      '[NHS](https://www.nhs.uk/live-well/exercise/)',
      '[duplicate](https://www.nhs.uk/live-well/exercise/)',
      '[insecure](http://example.com)',
      '[unsafe](javascript:alert(1))'
    ].join(' ')
    expect(countValidMarkdownCitations(text)).toBe(1)
  })

})

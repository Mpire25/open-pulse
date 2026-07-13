export interface UrlCitationAnnotation {
  type?: string
  start_index?: number
  end_index?: number
  url?: string
  title?: string
}

interface Citation {
  startIndex: number | null
  endIndex: number | null
  url: string
  title: string
  number: number
}

function safeCitationUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    // Parentheses delimit Markdown links, so encode them before rendering.
    return url.toString().replaceAll('(', '%28').replaceAll(')', '%29')
  } catch {
    return null
  }
}

function safeTitle(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim()) return fallback
  return value.trim().replaceAll('[', '(').replaceAll(']', ')').replaceAll('\n', ' ')
}

function citationsFromAnnotations(annotations: UrlCitationAnnotation[]): Citation[] {
  const numberByUrl = new Map<string, number>()
  const citations: Citation[] = []

  for (const annotation of annotations) {
    if (annotation.type !== 'url_citation') continue
    const url = safeCitationUrl(annotation.url)
    if (!url) continue
    const number = numberByUrl.get(url) ?? numberByUrl.size + 1
    numberByUrl.set(url, number)
    const validRange =
      Number.isInteger(annotation.start_index) &&
      Number.isInteger(annotation.end_index) &&
      (annotation.start_index as number) >= 0 &&
      (annotation.end_index as number) >= (annotation.start_index as number) &&
      (annotation.end_index as number) <= Number.MAX_SAFE_INTEGER
    citations.push({
      startIndex: validRange ? (annotation.start_index as number) : null,
      endIndex: validRange ? (annotation.end_index as number) : null,
      url,
      title: safeTitle(annotation.title, new URL(url).hostname),
      number
    })
  }
  return citations
}

export function countValidUrlCitations(annotations: UrlCitationAnnotation[]): number {
  return citationsFromAnnotations(annotations).length
}

export function countValidMarkdownCitations(text: string): number {
  const urls = new Set<string>()
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    const url = safeCitationUrl(match[1])
    if (url) urls.add(url)
  }
  return urls.size
}

/** Adds numbered, clickable markers and a compact source list to model text. */
export function addUrlCitations(text: string, annotations: UrlCitationAnnotation[]): string {
  const citations = citationsFromAnnotations(annotations).map((citation) => ({
    ...citation,
    startIndex: citation.startIndex != null && citation.startIndex <= text.length ? citation.startIndex : null,
    endIndex: citation.endIndex != null && citation.endIndex <= text.length ? citation.endIndex : null
  }))

  if (!citations.length) return text

  const insertions = new Map<number, Citation[]>()
  for (const citation of citations) {
    if (citation.endIndex == null) continue
    const atPosition = insertions.get(citation.endIndex) ?? []
    if (!atPosition.some((item) => item.number === citation.number)) atPosition.push(citation)
    insertions.set(citation.endIndex, atPosition)
  }

  let citedText = ''
  for (let index = 0; index <= text.length; index++) {
    if (index > 0) citedText += text[index - 1]
    const atPosition = insertions.get(index)
    if (atPosition) {
      citedText += atPosition.map((citation) => ` [${citation.number}](${citation.url})`).join('')
    }
  }

  const unique = citations
    .filter((citation, index) => citations.findIndex((candidate) => candidate.url === citation.url) === index)
    .sort((left, right) => left.number - right.number)
  const sources = unique.map((citation) => `- [${citation.number} · ${citation.title}](${citation.url})`).join('\n')
  return `${citedText}\n\n**Sources**\n${sources}`
}

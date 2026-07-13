export type ResearchReason = 'explicit' | 'external-guidance' | 'medical-guidance' | 'product-information' | 'none'

export interface ResearchPolicy {
  enabled: boolean
  maxSearchTurns: number
  reason: ResearchReason
}

const EXPLICIT_RESEARCH = /\b(search(?: the)? web|web search|research|look (?:it |this )?up|browse|online|sources?|citations?|cite|evidence|stud(?:y|ies)|literature|latest|up-to-date|current (?:guidance|recommendations?|evidence|research|version|information))\b/i
const EXTERNAL_GUIDANCE = /\b(nhs|nice|who|cdc|guidelines?|recommendations?|recommended|ideal(?:s)?|healthy|normal|clinical guidance|public health)\b/i
const MEDICAL_GUIDANCE = /\b(medications?|treatments?|diagnos(?:is|e)|symptoms?|diseases?|medical conditions?|clinician|doctor|safe|unsafe|concerning|should (?:i )?worry)\b/i
const PRODUCT_INFORMATION = /\b(product information|product specs?|device compatibility|fitbit feature|chatgpt feature|software version|release notes?)\b/i
const BROAD_RESEARCH = /\b(overall|current health|health overview|across|multiple|in general|deep research|thorough(?:ly)?|comprehensive)\b/i

export function researchPolicyForRequest(userText: string): ResearchPolicy {
  const explicit = EXPLICIT_RESEARCH.test(userText)
  const externalGuidance = EXTERNAL_GUIDANCE.test(userText)
  const medicalGuidance = MEDICAL_GUIDANCE.test(userText)
  const productInformation = PRODUCT_INFORMATION.test(userText)
  const enabled = explicit || externalGuidance || medicalGuidance || productInformation
  if (!enabled) return { enabled: false, maxSearchTurns: 0, reason: 'none' }

  const reason: ResearchReason = explicit
    ? 'explicit'
    : externalGuidance
      ? 'external-guidance'
      : medicalGuidance
        ? 'medical-guidance'
        : 'product-information'
  const maxSearchTurns = BROAD_RESEARCH.test(userText) || (explicit && /\b(compare|several|multiple|sources)\b/i.test(userText))
    ? 2
    : 1
  return { enabled: true, maxSearchTurns, reason }
}

export function webResearchAvailable(
  policy: ResearchPolicy,
  researchTurnsUsed: number,
  forceNoTools: boolean
): boolean {
  return policy.enabled && researchTurnsUsed < policy.maxSearchTurns && !forceNoTools
}

export type ResearchCompletionAction = 'complete' | 'repair-citations' | 'refuse-uncited'

export function researchCompletionAction(
  webSearches: number,
  citations: number,
  repairAttempted: boolean,
  canRepair: boolean
): ResearchCompletionAction {
  if (webSearches === 0 || citations > 0) return 'complete'
  return !repairAttempted && canRepair ? 'repair-citations' : 'refuse-uncited'
}

function redactSearchText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[date]')
    .replace(/\b\d+(?:\.\d+)?\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

export interface SanitizedWebSearchAction {
  action: 'search' | 'open_page' | 'find_in_page' | 'unknown'
  query?: string
}

export function sanitizeWebSearchAction(value: unknown): SanitizedWebSearchAction {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return { action: 'unknown' }
  const item = value as Record<string, unknown>
  const action = item.type === 'search' || item.type === 'open_page' || item.type === 'find_in_page'
    ? item.type
    : 'unknown'
  const rawQueries = typeof item.query === 'string'
    ? [item.query]
    : Array.isArray(item.queries)
      ? item.queries.filter((query): query is string => typeof query === 'string')
      : []
  const query = redactSearchText(rawQueries.join(' | '))
  return query ? { action, query } : { action }
}

export const CITATION_REPAIR_INSTRUCTION = `Rewrite the answer using only the health data and web research already present in this conversation. Every factual claim derived from web research must carry a clickable inline source citation from the existing web-search results. Do not call any tools or add unsupported facts. If source annotations are unavailable, say that you could not verify the external guidance instead of presenting it as sourced advice.`

export const UNCITED_RESEARCH_MESSAGE =
  'I found potentially relevant external information, but I could not attach verifiable source citations. I have not presented it as health guidance. Please try the question again.'

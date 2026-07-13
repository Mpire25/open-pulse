export type ResearchReason = 'explicit' | 'external-guidance' | 'medical-guidance' | 'product-information' | 'none'

export interface ResearchPolicy {
  enabled: boolean
  maxSearchTurns: number
  reason: ResearchReason
}

const EXPLICIT_RESEARCH = /\b(search(?: the)? web|web search|research|look (?:it |this )?up|browse|online|sources?|citations?|cite|evidence|stud(?:y|ies)|literature|latest|up-to-date|reddit|forums?|user reports?|community discussions?|current (?:guidance|recommendations?|evidence|research|version|information))\b/i
const EXTERNAL_GUIDANCE = /\b(nhs|nice|who|cdc|guidelines?|recommendations?|recommended|ideal(?:s)?|healthy|normal|clinical guidance|public health)\b/i
const MEDICAL_GUIDANCE = /\b(medications?|treatments?|diagnos(?:is|e)|symptoms?|diseases?|medical conditions?|clinician|doctor|safe|unsafe|concerning|should (?:i )?worry)\b/i
const NICHE_HEALTH_GUIDANCE = /\b(calorie deficits?|energy restriction|retatrutide|semaglutide|tirzepatide|liraglutide|ozempic|wegovy|mounjaro|zepbound|glp-?1|creatine|caffeine|pre-?workout|melatonin|magnesium|electrolytes?|supplements?|testosterone|trt|anabolic steroids?)\b/i
const PRODUCT_INFORMATION = /\b(product information|product specs?|device compatibility|fitbit feature|chatgpt feature|software version|release notes?)\b/i
const BROAD_RESEARCH = /\b(overall|current health|health overview|across|multiple|in general|deep research|thorough(?:ly)?|comprehensive)\b/i

export function researchPolicyForRequest(userText: string): ResearchPolicy {
  const explicit = EXPLICIT_RESEARCH.test(userText)
  const externalGuidance = EXTERNAL_GUIDANCE.test(userText)
  const medicalGuidance = MEDICAL_GUIDANCE.test(userText)
  const nicheHealthGuidance = NICHE_HEALTH_GUIDANCE.test(userText)
  const productInformation = PRODUCT_INFORMATION.test(userText)
  const enabled = explicit || externalGuidance || medicalGuidance || nicheHealthGuidance || productInformation
  if (!enabled) return { enabled: false, maxSearchTurns: 0, reason: 'none' }

  const reason: ResearchReason = explicit
    ? 'explicit'
    : externalGuidance
      ? 'external-guidance'
      : medicalGuidance || nicheHealthGuidance
        ? 'medical-guidance'
        : 'product-information'
  const maxSearchTurns = BROAD_RESEARCH.test(userText) || (explicit && /\b(compare|several|multiple|sources)\b/i.test(userText))
    ? 2
    : 1
  return { enabled: true, maxSearchTurns, reason }
}

const SAFE_RESEARCH_TOPICS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(steps?|walking|activity|active minutes?|exercise)\b/i, label: 'physical activity' },
  { pattern: /\b(resting heart rate|heart rate|pulse)\b/i, label: 'resting heart rate' },
  { pattern: /\b(hrv|heart rate variability)\b/i, label: 'heart rate variability' },
  { pattern: /\b(spo2|oxygen saturation|blood oxygen)\b/i, label: 'blood oxygen saturation' },
  { pattern: /\b(breathing|respiratory rate)\b/i, label: 'respiratory rate' },
  { pattern: /\b(skin temperature|temperature deviation)\b/i, label: 'skin temperature' },
  { pattern: /\b(sleep|insomnia|sleep stages?|sleep efficiency)\b/i, label: 'sleep' },
  { pattern: /\b(workouts?|training|recovery)\b/i, label: 'exercise recovery' },
  { pattern: /\b(weight|bmi|body mass index|body fat)\b/i, label: 'body composition' },
  { pattern: /\b(nutrition|diet|calories?|protein|carbs?|carbohydrates?|fat|fiber|fibre|sodium|sugar)\b/i, label: 'nutrition' },
  { pattern: /\b(calorie deficits?|cutting|energy restriction|dieting)\b/i, label: 'calorie deficits' },
  { pattern: /\b(water|hydration)\b/i, label: 'hydration' },
  { pattern: /\b(medications?|treatments?|drug safety)\b/i, label: 'medication and treatment safety' },
  { pattern: /\bretatrutide\b/i, label: 'retatrutide' },
  { pattern: /\bsemaglutide|ozempic|wegovy\b/i, label: 'semaglutide' },
  { pattern: /\btirzepatide|mounjaro|zepbound\b/i, label: 'tirzepatide' },
  { pattern: /\bliraglutide|saxenda|victoza\b/i, label: 'liraglutide' },
  { pattern: /\bglp-?1\b/i, label: 'GLP-1 medicines' },
  { pattern: /\bcreatine\b/i, label: 'creatine supplementation' },
  { pattern: /\bcaffeine\b/i, label: 'caffeine' },
  { pattern: /\bpre-?workout\b/i, label: 'pre-workout supplements' },
  { pattern: /\bmelatonin\b/i, label: 'melatonin' },
  { pattern: /\bmagnesium\b/i, label: 'magnesium supplementation' },
  { pattern: /\belectrolytes?\b/i, label: 'electrolyte supplementation' },
  { pattern: /\b(testosterone|trt|anabolic steroids?)\b/i, label: 'testosterone and anabolic drugs' },
  { pattern: /\b(reddit|forums?|communities|community discussions?|user reports?|people report|experiences?|anecdot(?:e|al))\b/i, label: 'first-person community reports' },
  { pattern: /\b(symptoms?|concerning|worry|safe|unsafe)\b/i, label: 'general medical safety guidance' },
  { pattern: /\b(fitbit|tracker|device compatibility)\b/i, label: 'Fitbit product information' },
  { pattern: /\b(chatgpt|openai|codex)\b/i, label: 'ChatGPT product information' },
  { pattern: /\b(software version|release notes?|product specs?|product information)\b/i, label: 'current product information' }
]

/**
 * Builds an allowlisted research prompt without copying any user text. Hosted
 * search therefore never receives health records, measurements, dates, names,
 * or arbitrary identifiers from the conversation.
 */
export function isolatedResearchPrompt(userText: string, policy: ResearchPolicy): string {
  const topics = SAFE_RESEARCH_TOPICS
    .filter((topic) => topic.pattern.test(userText))
    .map((topic) => topic.label)
  const selected = [...new Set(topics)].slice(0, 6)
  const fallback = policy.reason === 'product-information'
    ? 'current product information'
    : policy.reason === 'medical-guidance'
      ? 'general medical safety guidance'
      : 'general health guidance'
  const subject = selected.length ? selected.join(', ') : fallback
  return `Research current information about ${subject}. Search broadly across primary research, clinical and official sources, specialist sites, and first-person community discussions when useful. Keep the result concise. Include relevant source links when available, but do not discard useful findings solely because citation annotations are unavailable. Clearly label anecdotal reports and uncertainty rather than presenting them as established medical evidence.`
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

import type { AssistantVisualPart, MetricKey } from '../shared/types'
import { METRIC_UNITS } from '../shared/health-metric-units'
import {
  normalizePresentationAggregations,
  PRESENTATION_TOOL,
  resolvePresentation,
  type AgentDataset
} from './assistant-presentation'

const FACT_PREFIX = '{{openpulse:fact:'

export const RESPONSE_FORMAT_INSTRUCTIONS = `Write the concise answer first, followed, only when a visual helps, by exactly one hidden comment: <!--openpulse:present JSON-->. Its JSON follows the schema below. Do not call a presentation tool, use a code block, or include anything after the comment. Complete needed health/research tool calls before the final answer; never finalize a promise to look something up later.
The app calculates the cards and replaces literal fact placeholders in your prose from those same validated values. For a metric card use {{openpulse:fact:0.formattedValue}} (includes units) or {{openpulse:fact:0.value}} (native units). For a comparison use {{openpulse:fact:0.current.formattedValue}} and {{openpulse:fact:0.previous.formattedValue}}. Index 0 means the first resolved visual, index 1 the second; visual order is overview, metric cards, comparisons, charts, sleep cards, nutrition cards, workouts. Every placeholder requires its corresponding card in the comment. Never independently calculate a displayed comparison or call analyze_daily_metrics solely for arithmetic that the comparison card can compute from supplied data. Keep analysis tools for substantive analysis, correlation and data outside the supplied datasets.
Comparison placeholders also support current.observations, previous.observations, direction, absoluteChange, percentChange, changeMagnitude and percentChangeMagnitude. Direction is higher, lower, unchanged, or not comparable. Raw absoluteChange and percentChange are signed; use the positive changeMagnitude or percentChangeMagnitude for "higher/lower by". Native numeric values need explicit units; formattedValue includes units (sleep is hours/minutes), so do not append another unit. Percent placeholders require a % sign. Never request a percentage when the baseline is zero or missing, or a change/direction judgement for unequal totals; just describe those totals. If records are missing, describe the gaps without a numeric placeholder for unavailable data. When no card helps, write an ordinary answer without placeholders or a comment.
Example: "Your daily average was {{openpulse:fact:0.current.formattedValue}} versus {{openpulse:fact:0.previous.formattedValue}} previously, {{openpulse:fact:0.direction}} by {{openpulse:fact:0.percentChangeMagnitude}}%."
Presentation JSON schema: ${JSON.stringify(PRESENTATION_TOOL.parameters)}`

export class ResponseProtocolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResponseProtocolError'
  }
}

/** Only the prefix before unvalidated markup may reach the UI, even on stop/timeout. */
export class AssistantResponseStream {
  private raw = ''
  private emitted = 0

  push(delta: string): string {
    this.raw += delta
    const cuts = [this.raw.indexOf('<!--'), this.raw.indexOf('{{')].filter((at) => at >= 0)
    let end = cuts.length ? Math.min(...cuts) : this.raw.length
    if (!cuts.length) {
      for (const marker of ['<!--', '{{']) {
        for (let length = 1; length < marker.length; length++) {
          if (this.raw.endsWith(marker.slice(0, length))) end = Math.min(end, this.raw.length - length)
        }
      }
    }
    const visible = this.raw.slice(this.emitted, end)
    this.emitted = end
    return visible
  }

  get visibleText(): string { return this.raw.slice(0, this.emitted) }
}

// This is the bounded subset used by PRESENTATION_TOOL, not a general JSON-schema engine.
interface PresentationSchema {
  type: string | string[]
  properties?: Record<string, PresentationSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: PresentationSchema
  minItems?: number
  maxItems?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  enum?: unknown[]
}

function validateSchema(value: unknown, schema: PresentationSchema, path = 'presentation'): void {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if (!types.includes(type) || (schema.enum && !schema.enum.includes(value))) {
    throw new ResponseProtocolError(`${path} has an unsupported value or type.`)
  }
  if (type === 'object') {
    const item = value as Record<string, unknown>
    const properties = schema.properties ?? {}
    if ((schema.required ?? []).some((key) => !Object.hasOwn(item, key)) ||
        (schema.additionalProperties === false && Object.keys(item).some((key) => !Object.hasOwn(properties, key)))) {
      throw new ResponseProtocolError(`${path} has missing or unknown fields.`)
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(item, key)) validateSchema(item[key], child, `${path}.${key}`)
    }
  } else if (type === 'array') {
    const items = value as unknown[]
    if (items.length < (schema.minItems ?? 0) || items.length > (schema.maxItems ?? Infinity)) {
      throw new ResponseProtocolError(`${path} has an invalid number of items.`)
    }
    if (schema.items) items.forEach((item) => validateSchema(item, schema.items!, `${path}[]`))
  } else if (type === 'string') {
    const text = value as string
    if (text.length < (schema.minLength ?? 0) || text.length > (schema.maxLength ?? Infinity) ||
        (schema.pattern && !new RegExp(schema.pattern).test(text))) {
      throw new ResponseProtocolError(`${path} has invalid text.`)
    }
  }
}

function numericFact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) throw new ResponseProtocolError('A requested fact is unavailable.')
  return String(Math.round(value * 10) / 10)
}

function formattedFact(value: number | null, metric: MetricKey): string {
  if (value == null || !Number.isFinite(value)) throw new ResponseProtocolError('A requested fact is unavailable.')
  if (metric === 'sleepMinutes') {
    const minutes = Math.round(value)
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  }
  const unit = METRIC_UNITS[metric]
  return `${Number(numericFact(value)).toLocaleString('en-GB')}${unit === '%' ? '' : ' '}${unit}`
}

function fact(part: AssistantVisualPart | undefined, path: string): string {
  if (part?.type === 'metric-card') {
    if (path === 'value') return numericFact(part.value)
    if (path === 'formattedValue') return formattedFact(part.value, part.metric)
  }
  if (part?.type === 'comparison') {
    switch (path) {
      case 'current.value': return numericFact(part.current.value)
      case 'previous.value': return numericFact(part.previous.value)
      case 'current.formattedValue': return formattedFact(part.current.value, part.metric)
      case 'previous.formattedValue': return formattedFact(part.previous.value, part.metric)
      case 'current.observations': return numericFact(part.current.observations)
      case 'previous.observations': return numericFact(part.previous.observations)
      case 'direction':
        return !part.comparable || part.absoluteChange == null ? 'not comparable'
          : part.absoluteChange === 0 ? 'unchanged' : part.absoluteChange > 0 ? 'higher' : 'lower'
      case 'absoluteChange': return numericFact(part.absoluteChange)
      case 'percentChange': return numericFact(part.percentChange)
      case 'changeMagnitude': return numericFact(part.absoluteChange == null ? null : Math.abs(part.absoluteChange))
      case 'percentChangeMagnitude': return numericFact(part.percentChange == null ? null : Math.abs(part.percentChange))
    }
  }
  throw new ResponseProtocolError('A fact placeholder does not match a supported card value.')
}

/** Prose with all presentation markup removed, or null if the prose itself depends on the cards. */
function plainProse(raw: string): string | null {
  const text = raw
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!--[\s\S]*$/, '')
    .replace(/```[\w-]*\s*```/g, '')
    .trim()
  if (!text || text.includes('{{') || text.includes('openpulse:')) return null
  return text
}

/**
 * Resolves the entire response atomically: never publish a partial set of
 * cards. When only the cards are invalid and the prose does not reference
 * them, the prose is kept without cards rather than asking for a correction.
 */
export function resolveAssistantResponse(
  raw: string,
  datasets: Map<string, AgentDataset>,
  userText: string,
  plainOnly = false
): { text: string; parts: AssistantVisualPart[]; droppedCards?: boolean } {
  try {
    return resolveStrict(raw, datasets, userText, plainOnly)
  } catch (error) {
    const prose = error instanceof ResponseProtocolError ? plainProse(raw) : null
    if (prose == null) throw error
    return { text: prose, parts: [], droppedCards: true }
  }
}

function resolveStrict(
  raw: string,
  datasets: Map<string, AgentDataset>,
  userText: string,
  plainOnly: boolean
): { text: string; parts: AssistantVisualPart[] } {
  let text = raw.trim()
  let parts: AssistantVisualPart[] = []
  const markers = [...text.matchAll(/<!--\s*openpulse:present\s+([\s\S]*?)-->/g)]
  if (markers.length > 1) throw new ResponseProtocolError('Use exactly one presentation comment.')
  if (markers.length) {
    if (plainOnly) throw new ResponseProtocolError('The fallback must be a plain answer.')
    const marker = markers[0]
    if (text.slice(marker.index! + marker[0].length).trim()) {
      throw new ResponseProtocolError('The presentation comment must be last.')
    }
    let args: unknown
    try { args = JSON.parse(marker[1]) } catch { throw new ResponseProtocolError('Presentation JSON is malformed.') }
    validateSchema(args, PRESENTATION_TOOL.parameters as unknown as PresentationSchema)
    const request = args as Record<string, unknown>
    const count = Object.values(request).reduce<number>((sum, items) => sum + (items as unknown[]).length, 0)
    if (!count || count > 2 || ((request.overviews as unknown[]).length && count !== 1)) {
      throw new ResponseProtocolError('Use one overview alone, or at most two visual blocks.')
    }
    try {
      parts = resolvePresentation(normalizePresentationAggregations(request, userText), datasets)
    } catch {
      throw new ResponseProtocolError('A card references an invalid dataset, date, record, or aggregation.')
    }
    if (parts.length !== count) throw new ResponseProtocolError('Some requested cards could not be resolved.')
    text = text.slice(0, marker.index).trim()
  }
  if (text.includes('<!--') || text.includes('openpulse:present')) {
    throw new ResponseProtocolError('Presentation markup is malformed.')
  }
  if (plainOnly && text.includes(FACT_PREFIX)) throw new ResponseProtocolError('The fallback must omit fact placeholders.')
  text = text.replace(/\{\{openpulse:fact:(\d+)\.([a-zA-Z.]+)\}\}/g, (_, index: string, path: string) =>
    fact(parts[Number(index)], path))
  if (text.includes('{{openpulse:') || text.includes('openpulse:fact:')) {
    throw new ResponseProtocolError('A fact placeholder is malformed or unresolved.')
  }
  if (!text && !parts.length) throw new ResponseProtocolError('The answer is empty.')
  return { text, parts }
}

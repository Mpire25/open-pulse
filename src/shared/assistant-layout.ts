import type { AssistantVisualPart } from './types'

export type AssistantVisualLayout = 'stack' | 'pair' | 'primary-supporting'

export function isPrimaryAssistantVisual(part: AssistantVisualPart): boolean {
  return part.type === 'trend-chart' || part.type === 'comparison'
}

export function assistantVisualLayout(
  parts: AssistantVisualPart[],
  compact: boolean
): AssistantVisualLayout {
  if (compact || parts.length !== 2) return 'stack'
  const primaryCount = parts.filter(isPrimaryAssistantVisual).length
  if (primaryCount === 1) return 'primary-supporting'
  if (primaryCount === 0) return 'pair'
  return 'stack'
}

export function orderAssistantVisuals(
  parts: AssistantVisualPart[],
  layout: AssistantVisualLayout
): AssistantVisualPart[] {
  if (layout !== 'primary-supporting') return parts
  return [...parts].sort((left, right) => Number(isPrimaryAssistantVisual(right)) - Number(isPrimaryAssistantVisual(left)))
}

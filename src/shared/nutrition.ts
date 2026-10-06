import type { AssistantNutritionValues, NutritionLogEntry } from './types'

export const NUTRITION_MEAL_GROUPS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Other'] as const
export type NutritionMealGroup = (typeof NUTRITION_MEAL_GROUPS)[number]

export const NUTRITION_VALUE_KEYS = [
  'calories',
  'proteinG',
  'carbsG',
  'fatG',
  'fiberG',
  'saturatedFatG',
  'sodiumG',
  'sugarG'
] as const

export type NutritionValueKey = (typeof NUTRITION_VALUE_KEYS)[number]

export function nutritionMealGroup(mealType: string | null): NutritionMealGroup {
  if (mealType === 'BREAKFAST') return 'Breakfast'
  if (mealType === 'LUNCH') return 'Lunch'
  if (mealType === 'DINNER') return 'Dinner'
  if (mealType === 'SNACK' || mealType?.startsWith('BEFORE_') || mealType === 'AFTER_DINNER') return 'Snack'
  return 'Other'
}

export function nutritionValue(entries: NutritionLogEntry[], key: NutritionValueKey): number | null {
  const values = entries.flatMap((entry) => entry[key] == null ? [] : [entry[key]])
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

export function nutritionTotals(entries: NutritionLogEntry[]): AssistantNutritionValues {
  return Object.fromEntries(
    NUTRITION_VALUE_KEYS.map((key) => [key, nutritionValue(entries, key)])
  ) as unknown as AssistantNutritionValues
}

export interface NutritionBreakdownItem {
  entry: NutritionLogEntry
  value: number
  /** Fraction (0–1) of the day's total. */
  share: number
}

export interface NutritionBreakdown {
  items: NutritionBreakdownItem[]
  /** Day total not explained by individual logs (rollup above the logged sum). */
  unattributed: number | null
  unattributedShare: number
  /** Logged foods that contributed nothing (zero or not recorded). */
  emptyCount: number
}

/**
 * Ranks a day's logged foods by how much they contributed to one nutrient.
 * `dayTotal` is the rollup shown on the page; when it exceeds the logged sum
 * by more than `tolerance`, the gap is reported as unattributed.
 */
export function nutritionBreakdown(
  entries: NutritionLogEntry[],
  key: NutritionValueKey,
  dayTotal: number | null,
  tolerance: number
): NutritionBreakdown {
  const valued = entries.flatMap((entry) => {
    const value = entry[key]
    return value != null && value > 0 ? [{ entry, value }] : []
  })
  const logged = valued.reduce((sum, item) => sum + item.value, 0)
  const gap = dayTotal != null ? dayTotal - logged : 0
  const unattributed = gap > tolerance ? gap : null
  const denominator = Math.max(logged + (unattributed ?? 0), 0)
  const share = (value: number): number => denominator > 0 ? value / denominator : 0

  return {
    items: valued
      .map((item) => ({ ...item, share: share(item.value) }))
      .sort((a, b) => b.value - a.value || Date.parse(a.entry.startTime) - Date.parse(b.entry.startTime)),
    unattributed,
    unattributedShare: unattributed != null ? share(unattributed) : 0,
    emptyCount: entries.length - valued.length
  }
}

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
  foodName: string
  /** Every log of this food for the day, earliest first. */
  entries: NutritionLogEntry[]
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
 * Repeat logs of the same food (by name, across meals) are combined.
 * `dayTotal` is the rollup shown on the page; when it exceeds the logged sum
 * by more than `tolerance`, the gap is reported as unattributed.
 */
export function nutritionBreakdown(
  entries: NutritionLogEntry[],
  key: NutritionValueKey,
  dayTotal: number | null,
  tolerance: number
): NutritionBreakdown {
  const foods = new Map<string, { foodName: string; entries: NutritionLogEntry[]; value: number }>()
  for (const entry of [...entries].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))) {
    const name = entry.foodName.trim().toLowerCase()
    const food = foods.get(name) ?? { foodName: entry.foodName, entries: [], value: 0 }
    food.entries.push(entry)
    food.value += entry[key] != null && entry[key] > 0 ? entry[key] : 0
    foods.set(name, food)
  }
  const valued = [...foods.values()].filter((food) => food.value > 0)
  const logged = valued.reduce((sum, food) => sum + food.value, 0)
  const gap = dayTotal != null ? dayTotal - logged : 0
  const unattributed = gap > tolerance ? gap : null
  const denominator = Math.max(logged + (unattributed ?? 0), 0)
  const share = (value: number): number => denominator > 0 ? value / denominator : 0

  return {
    // Map order is first-logged order, so equal values keep the earlier food first.
    items: valued
      .map((food) => ({ ...food, share: share(food.value) }))
      .sort((a, b) => b.value - a.value),
    unattributed,
    unattributedShare: unattributed != null ? share(unattributed) : 0,
    emptyCount: foods.size - valued.length
  }
}

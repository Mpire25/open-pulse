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

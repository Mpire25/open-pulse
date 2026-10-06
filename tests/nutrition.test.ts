import { describe, expect, test } from 'bun:test'
import { gramsFromNutrientNode, nutrientGrams, nutrientMineralGrams } from '../src/main/nutrition'
import { nutritionBreakdown } from '../src/shared/nutrition'

describe('nutrition rollup normalization', () => {
  test('reads the existing gramsSum response shape', () => {
    expect(nutrientGrams({ protein: { gramsSum: 137 } }, ['protein'])).toBe(137)
  })

  test('reads common Protein aliases and direct gram values', () => {
    expect(nutrientGrams({ totalProtein: { grams: '126.5' } }, ['protein', 'totalProtein'])).toBe(126.5)
  })

  test('reads a nested nutrient map', () => {
    const log = { nutrients: { dietaryProtein: { amount: { grams: 98 } } } }
    expect(nutrientGrams(log, ['protein', 'dietaryProtein'])).toBe(98)
  })

  test('reads a descriptor-array response', () => {
    const log = { nutrients: [{ nutrientType: 'PROTEIN', amount: { value: 112, unit: 'g' } }] }
    expect(nutrientGrams(log, ['protein'])).toBe(112)
  })

  test('converts milligrams to grams', () => {
    expect(gramsFromNutrientNode({ milligramsSum: 84_500 })).toBe(84.5)
  })

  test('keeps structured Google Health mineral quantities in grams', () => {
    const log = { nutrients: [{ nutrient: 'SODIUM', quantity: { gramsSum: 1.75 } }] }
    expect(nutrientMineralGrams(log, ['sodium'])).toBe(1.75)
  })

  test('normalizes direct legacy mineral values from milligrams to grams', () => {
    const log = { nutrients: [{ nutrient: 'SODIUM', quantity: 3980 }] }
    expect(nutrientMineralGrams(log, ['sodium'])).toBe(3.98)
  })

  test('sums a direct array of nutrient amounts', () => {
    expect(gramsFromNutrientNode([{ grams: 40 }, { grams: 32.5 }])).toBe(72.5)
  })

  test('returns null when the nutrient is absent', () => {
    expect(nutrientGrams({ carbohydrate: { gramsSum: 210 } }, ['protein'])).toBeNull()
  })
})

describe('nutrition breakdown', () => {
  const entry = (id: string, calories: number | null, startTime = '2026-10-06T08:00:00Z') => ({
    id,
    startTime,
    endTime: startTime,
    foodName: id,
    mealType: null,
    servingLabel: null,
    calories,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    saturatedFatG: null,
    sodiumG: null,
    sugarG: null
  })

  test('ranks foods by contribution and counts foods with nothing recorded', () => {
    const result = nutritionBreakdown(
      [entry('toast', 200), entry('coffee', 0), entry('pasta', 600), entry('water', null)],
      'calories',
      800,
      8
    )
    expect(result.items.map((item) => [item.entry.id, item.share])).toEqual([['pasta', 0.75], ['toast', 0.25]])
    expect(result.unattributed).toBeNull()
    expect(result.emptyCount).toBe(2)
  })

  test('reports a day total above the logged sum as unattributed', () => {
    const result = nutritionBreakdown([entry('toast', 300)], 'calories', 400, 4)
    expect(result.unattributed).toBe(100)
    expect(result.unattributedShare).toBe(0.25)
    expect(result.items[0].share).toBe(0.75)
  })

  test('ignores small gaps and logged sums above the day total', () => {
    expect(nutritionBreakdown([entry('toast', 398)], 'calories', 400, 4).unattributed).toBeNull()
    const over = nutritionBreakdown([entry('a', 300), entry('b', 200)], 'calories', 400, 4)
    expect(over.unattributed).toBeNull()
    expect(over.items.map((item) => item.share)).toEqual([0.6, 0.4])
  })
})

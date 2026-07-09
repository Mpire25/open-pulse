import { describe, expect, test } from 'bun:test'
import { gramsFromNutrientNode, nutrientGrams } from '../src/main/nutrition'

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

  test('sums a direct array of nutrient amounts', () => {
    expect(gramsFromNutrientNode([{ grams: 40 }, { grams: 32.5 }])).toBe(72.5)
  })

  test('returns null when the nutrient is absent', () => {
    expect(nutrientGrams({ carbohydrate: { gramsSum: 210 } }, ['protein'])).toBeNull()
  })
})

import { describe, expect, test } from 'bun:test'
import { bmiFrom, parseBodyMeasurements, parseLatestHeight, parseNutritionLogs } from '../src/main/body-nutrition-detail'

describe('body and nutrition record normalization', () => {
  test('retains individual food, meal, serving, energy, and nutrient details', () => {
    const entries = parseNutritionLogs([{ 
      name: 'users/me/dataTypes/nutrition-log/dataPoints/lunch',
      nutritionLog: {
        interval: { startTime: '2026-07-10T12:35:00Z', endTime: '2026-07-10T12:40:00Z' },
        foodDisplayName: 'Chicken pesto pasta',
        mealType: 'LUNCH',
        serving: { amount: 1.5, foodMeasurementUnitDisplayName: 'bowl' },
        energy: { kcal: 684 },
        totalCarbohydrate: { grams: 78 },
        totalFat: { grams: 22 },
        nutrients: [
          { nutrient: 'PROTEIN', quantity: { grams: 43 } },
          { nutrient: 'DIETARY_FIBER', quantity: { grams: 8 } },
          { nutrient: 'SATURATED_FAT', quantity: { grams: 7 } },
          { nutrient: 'SODIUM', quantity: 860 },
          { nutrient: 'SUGAR', quantity: { grams: 6 } }
        ]
      }
    }])

    expect(entries).toEqual([{
      id: 'users/me/dataTypes/nutrition-log/dataPoints/lunch',
      startTime: '2026-07-10T12:35:00Z',
      endTime: '2026-07-10T12:40:00Z',
      foodName: 'Chicken pesto pasta',
      mealType: 'LUNCH',
      servingLabel: '1.5 bowls',
      calories: 684,
      proteinG: 43,
      carbsG: 78,
      fatG: 22,
      fiberG: 8,
      saturatedFatG: 7,
      sodiumG: 0.86,
      sugarG: 6
    }])
  })

  test('pairs weight and body-fat readings from the same scale session', () => {
    const measurements = parseBodyMeasurements(
      [{
        name: 'weight-1',
        weight: {
          sampleTime: { physicalTime: '2026-07-10T07:30:00Z' },
          weightGrams: 82340,
          notes: 'Before breakfast'
        }
      }],
      [{
        name: 'fat-1',
        bodyFat: {
          sampleTime: { physicalTime: '2026-07-10T07:32:00Z' },
          percentage: 18.4
        }
      }]
    )

    expect(measurements).toEqual([{
      id: 'weight-1|fat-1',
      time: '2026-07-10T07:30:00Z',
      weightKg: 82.34,
      bodyFatPct: 18.4,
      notes: 'Before breakfast'
    }])
  })

  test('keeps unpaired body-fat readings rather than discarding them', () => {
    const measurements = parseBodyMeasurements([], [{
      bodyFat: { sampleTime: { physicalTime: '2026-07-10T09:00:00Z' }, percentage: 19.1 }
    }])

    expect(measurements[0]?.weightKg).toBeNull()
    expect(measurements[0]?.bodyFatPct).toBe(19.1)
  })

  test('uses the latest valid height as a static BMI input', () => {
    const height = parseLatestHeight([
      { height: { sampleTime: { physicalTime: '2024-01-01T08:00:00Z' }, heightMillimeters: 1775 } },
      { height: { sampleTime: { physicalTime: '2026-01-01T08:00:00Z' }, heightMillimeters: 1782 } }
    ])
    expect(height).toBe(178.2)
    expect(bmiFrom(82.4, height)).toBe(25.9)
  })
})

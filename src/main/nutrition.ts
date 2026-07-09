// Nutrition rollups have appeared in a few equivalent shapes across data
// sources. Keep the shape-tolerance isolated here so every macro is parsed by
// the same unit-aware rules instead of maintaining one-off property guesses.

const GRAM_KEYS = new Set([
  'gram',
  'grams',
  'gramsum',
  'gramssum',
  'gramstotal',
  'totalgrams'
])

const MILLIGRAM_KEYS = new Set([
  'milligram',
  'milligrams',
  'milligramsum',
  'milligramssum',
  'milligramstotal',
  'totalmilligrams'
])

const VALUE_KEYS = ['value', 'valueSum', 'amount', 'amountSum', 'quantity', 'mass', 'sum', 'total']
const CONTAINER_KEYS = new Set(['nutrients', 'nutrienttotals', 'macronutrients', 'nutrition', 'totals'])
const IDENTIFIER_KEYS = ['name', 'type', 'nutrient', 'nutrientName', 'nutrientType', 'key']

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function finiteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Convert a nutrient amount node to grams without confusing mg for g. */
export function gramsFromNutrientNode(node: unknown): number | null {
  const primitive = finiteNumber(node)
  if (primitive != null) return primitive

  if (Array.isArray(node)) {
    const values = node.map(gramsFromNutrientNode).filter((value): value is number => value != null)
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null
  }

  const rec = record(node)
  if (!rec) return null

  for (const [key, value] of Object.entries(rec)) {
    if (GRAM_KEYS.has(normalizedKey(key))) {
      const grams = finiteNumber(value)
      if (grams != null) return grams
    }
  }

  for (const [key, value] of Object.entries(rec)) {
    if (MILLIGRAM_KEYS.has(normalizedKey(key))) {
      const milligrams = finiteNumber(value)
      if (milligrams != null) return milligrams / 1000
    }
  }

  const unit = typeof rec.unit === 'string' ? normalizedKey(rec.unit) : ''
  for (const key of VALUE_KEYS) {
    if (!(key in rec)) continue
    const value = finiteNumber(rec[key])
    if (value != null) return unit === 'mg' || unit === 'milligram' || unit === 'milligrams' ? value / 1000 : value

    const nested = gramsFromNutrientNode(rec[key])
    if (nested != null) return nested
  }

  return null
}

function findNutrientNode(value: unknown, aliases: Set<string>, depth = 0): unknown {
  if (depth > 4) return undefined

  if (Array.isArray(value)) {
    for (const item of value) {
      const rec = record(item)
      if (!rec) continue
      const identifier = IDENTIFIER_KEYS.map((key) => rec[key]).find((entry) => typeof entry === 'string')
      if (typeof identifier === 'string' && aliases.has(normalizedKey(identifier))) {
        return rec.value ?? rec.amount ?? rec.quantity ?? rec.mass ?? rec
      }
    }
    return undefined
  }

  const rec = record(value)
  if (!rec) return undefined

  for (const [key, node] of Object.entries(rec)) {
    if (aliases.has(normalizedKey(key))) return node
  }

  for (const [key, child] of Object.entries(rec)) {
    if (!CONTAINER_KEYS.has(normalizedKey(key))) continue
    const found = findNutrientNode(child, aliases, depth + 1)
    if (found !== undefined) return found
  }

  return undefined
}

/** Locate a named nutrient in direct, nested-map, or descriptor-array forms. */
export function nutrientGrams(log: Record<string, unknown>, aliases: string[]): number | null {
  const normalizedAliases = new Set(aliases.map(normalizedKey))
  return gramsFromNutrientNode(findNutrientNode(log, normalizedAliases))
}

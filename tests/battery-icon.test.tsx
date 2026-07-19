import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BatteryIcon, batteryColor, clampBatteryPct } from '../src/renderer/src/components/BatteryIcon'

describe('reactive battery icon', () => {
  test('fills the glyph in direct proportion to the battery percentage', () => {
    const html = renderToStaticMarkup(<BatteryIcon pct={50} />)

    expect(html).toContain('width="7.5"')
    expect(html).toContain('var(--color-activity)')
  })

  test('uses green, orange, and red charge thresholds', () => {
    expect(batteryColor(51)).toBe('var(--color-recovery)')
    expect(batteryColor(50)).toBe('var(--color-activity)')
    expect(batteryColor(21)).toBe('var(--color-activity)')
    expect(batteryColor(20)).toBe('var(--color-danger)')
  })

  test('clamps malformed or out-of-range readings', () => {
    expect(clampBatteryPct(-5)).toBe(0)
    expect(clampBatteryPct(105)).toBe(100)
    expect(clampBatteryPct(Number.NaN)).toBe(0)
  })
})

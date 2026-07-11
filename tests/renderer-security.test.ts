import { describe, expect, test } from 'bun:test'
import { createRendererTarget, safeExternalUrl } from '../src/main/renderer-security'

describe('Electron renderer trust boundary', () => {
  test('packaged builds ignore an inherited development renderer URL', () => {
    const target = createRendererTarget({
      isPackaged: true,
      developmentUrl: 'https://attacker.example/renderer',
      bundledRendererPath: '/Applications/OpenPulse.app/Contents/Resources/app.asar/out/renderer/index.html'
    })

    expect(target.isDevelopment).toBe(false)
    expect(target.url.protocol).toBe('file:')
    expect(target.isExpectedUrl('https://attacker.example/renderer')).toBe(false)
    expect(target.isExpectedUrl(target.url.toString())).toBe(true)
  })

  test('development trusts only the exact configured renderer document', () => {
    const target = createRendererTarget({
      isPackaged: false,
      developmentUrl: 'http://127.0.0.1:43197/app?mode=dev',
      bundledRendererPath: '/tmp/index.html'
    })

    expect(target.isDevelopment).toBe(true)
    expect(target.isExpectedUrl('http://127.0.0.1:43197/app?mode=dev#settings')).toBe(true)
    expect(target.isExpectedUrl('http://127.0.0.1:43197/other?mode=dev')).toBe(false)
    expect(target.isExpectedUrl('http://localhost:43197/app?mode=dev')).toBe(false)
  })

  test('rejects unsafe development and external URLs', () => {
    expect(() =>
      createRendererTarget({
        isPackaged: false,
        developmentUrl: 'file:///tmp/attacker.html',
        bundledRendererPath: '/tmp/index.html'
      })
    ).toThrow()

    expect(safeExternalUrl('https://example.com/path')).toBe('https://example.com/path')
    expect(safeExternalUrl('https://user:pass@example.com/path')).toBeNull()
    expect(safeExternalUrl('file:///Applications/Calculator.app')).toBeNull()
    expect(safeExternalUrl('custom-scheme://payload')).toBeNull()
  })
})

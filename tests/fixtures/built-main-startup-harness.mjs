// Evaluate the built entry with Electron mocked and app readiness held pending.
// This never opens windows, accesses user profiles, or touches credential storage.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { builtinModules, createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createContext, Script, SourceTextModule, SyntheticModule } from 'node:vm'

const root = resolve(process.argv[2])
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const entry = resolve(root, manifest.main)
const code = readFileSync(entry, 'utf8')
let readinessCalls = 0
const boundary = () => { throw new Error('Built-entry test attempted to access Electron state before readiness') }
const app = {
  requestSingleInstanceLock: () => true,
  whenReady: () => { readinessCalls++; return new Promise(() => {}) },
  on: () => {}, once: () => {},
  getPath: boundary, exit: boundary, quit: boundary
}
const electron = {
  app,
  safeStorage: new Proxy({}, { get: boundary }),
  BrowserWindow: boundary, Menu: {}, shell: {}, ipcMain: {}, Notification: boundary,
  webContents: {}, session: {}, nativeImage: {}, Tray: boundary, screen: {}
}
const context = createContext({ console, process, Buffer, URL, URLSearchParams, TextDecoder, TextEncoder, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, fetch })
const realRequire = createRequire(entry)
const allowedBuiltins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))
function load(specifier) {
  if (specifier === 'electron') return electron
  assert.ok(allowedBuiltins.has(specifier), `Unexpected unbundled dependency: ${specifier}`)
  return realRequire(specifier)
}

if (entry.endsWith('.mjs') || (!entry.endsWith('.cjs') && manifest.type === 'module')) {
  const module = new SourceTextModule(code, {
    context,
    identifier: pathToFileURL(entry).href,
    initializeImportMeta: (meta) => {
      meta.url = pathToFileURL(entry).href
      meta.dirname = dirname(entry)
      meta.filename = entry
    }
  })
  await module.link(async (specifier) => {
    const values = load(specifier)
    const names = [...new Set(['default', ...Object.keys(values)])]
    return new SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, name === 'default' ? values : values[name])
    }, { context })
  })
  await module.evaluate()
} else {
  const module = { exports: {} }
  const wrapper = new Script(`(function(exports, require, module, __filename, __dirname) {\n${code}\n})`, { filename: entry }).runInContext(context)
  wrapper(module.exports, load, module, entry, dirname(entry))
}
assert.equal(readinessCalls, 1, 'Built main should load and register application startup')
console.log('Built main loads and registers startup without accessing Electron state.')

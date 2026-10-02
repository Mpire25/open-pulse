import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

test('production main entry loads with its declared module format', async () => {
  // Vite changes NODE_ENV during config resolution; keep that and its module
  // loading separate from renderer tests and their process-wide mocks.
  const child = Bun.spawn([
    Bun.which('bun')!, resolve(import.meta.dir, 'fixtures/built-main-startup-build-harness.ts')
  ], { stdout: 'pipe', stderr: 'pipe' })
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()
  ])
  if (code !== 0) throw new Error(`Built main failed to load (${code}).\n${stdout}\n${stderr}`)
  expect(stdout).toContain('Built main loads and registers startup')
}, 15_000)

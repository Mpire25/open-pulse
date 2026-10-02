import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveConfig } from 'electron-vite'
import { build } from 'vite'

const output = mkdtempSync(join(tmpdir(), 'openpulse-built-entry-'))
try {
  const { config } = await resolveConfig({ logLevel: 'silent' }, 'build')
  if (!config?.main) throw new Error('Missing Electron main build configuration')
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  // Mirror the package boundary around a freshly bundled entry, without
  // overwriting out/ or launching Electron against the user's profile.
  writeFileSync(join(output, 'package.json'), JSON.stringify(manifest))
  await build({ ...config.main, build: { ...config.main.build, outDir: join(output, 'out/main') } })
  const node = Bun.which('node')
  if (!node) throw new Error('Node.js is required for the built-entry startup check')
  const child = Bun.spawn([
    node, '--experimental-vm-modules', resolve(import.meta.dir, 'built-main-startup-harness.mjs'), output
  ], { stdout: 'pipe', stderr: 'pipe' })
  const [code, stdout, stderr] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()
  ])
  if (code !== 0) throw new Error(`Built main failed to load (${code}).\n${stdout}\n${stderr}`)
  process.stdout.write(stdout)
} finally {
  rmSync(output, { recursive: true, force: true })
}

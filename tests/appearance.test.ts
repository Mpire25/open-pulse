import { test } from 'bun:test'
import { resolve } from 'node:path'

for (const harness of ['appearance-main-harness.ts', 'appearance-renderer-harness.tsx']) {
  test(harness, async () => {
    const process = Bun.spawn([Bun.which('bun') ?? 'bun', 'test', resolve(import.meta.dir, 'fixtures', harness)], {
      stdout: 'pipe', stderr: 'pipe'
    })
    const [code, stdout, stderr] = await Promise.all([
      process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()
    ])
    if (code !== 0) throw new Error(`Appearance harness failed (${code}).\n${stdout}\n${stderr}`)
  }, 15_000)
}

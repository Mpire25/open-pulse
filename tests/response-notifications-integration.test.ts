import { test } from 'bun:test'
import { resolve } from 'node:path'

for (const fixture of ['response-notifications-native-harness.ts', 'response-notifications-renderer-harness.tsx', 'response-notifications-app-harness.tsx']) {
  test(fixture, async () => {
    const child = Bun.spawn([Bun.which('bun') ?? 'bun', 'test', resolve(import.meta.dir, 'fixtures', fixture)], {
      stdout: 'pipe', stderr: 'pipe'
    })
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()
    ])
    if (code !== 0) throw new Error(`Notification harness failed (${code}).\n${stdout}\n${stderr}`)
  })
}

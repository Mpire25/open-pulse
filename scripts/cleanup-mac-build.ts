import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const releaseDirectory = 'release'

for (const directory of ['mac', 'mac-arm64', 'mac-universal']) {
  const path = join(releaseDirectory, directory)
  rmSync(path, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  })
}

const latestDmg = readdirSync(releaseDirectory)
  .filter((name) => name.endsWith('.dmg'))
  .map((name) => ({ name, modified: statSync(join(releaseDirectory, name)).mtimeMs }))
  .sort((a, b) => b.modified - a.modified)[0]

if (latestDmg) {
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR
  const color = (code: string, text: string): string =>
    useColor ? `\u001B[${code}m${text}\u001B[0m` : text
  const dmgPath = join(releaseDirectory, latestDmg.name)

  console.log(`
${color('1;32', '╔══════════════════════════════════════════════╗')}
${color('1;32', '║       ✓ OPENPULSE BUILD COMPLETE             ║')}
${color('1;32', '╚══════════════════════════════════════════════╝')}

${color('1;33', 'NEXT STEP — INSTALL THE APP')}

  1. Open ${color('1;36', dmgPath)}
  2. Drag ${color('1', 'OpenPulse')} into ${color('1', 'Applications')}
`)
}

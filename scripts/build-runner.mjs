import { existsSync, readdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outfile = resolve(repoRoot, 'packages/runner/dist/index.js')

await mkdir(dirname(outfile), { recursive: true })

const esbuildExecutable = resolveEsbuildExecutable()
const entry = resolve(repoRoot, 'packages/runner/src/index.ts')
const args = [
  entry,
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--target=node20',
  `--outfile=${outfile}`,
  '--external:playwright',
  '--external:fastify',
  '--external:@fastify/cors',
  '--external:dotenv',
  '--external:nanoid',
  '--external:openai',
  '--external:@anthropic-ai/sdk',
  '--external:pino-pretty',
  '--external:zod',
]

const result = spawnSync(esbuildExecutable.exe, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  windowsHide: true,
  shell: esbuildExecutable.needsShell,
})

if (result.status !== 0) {
  if (result.error) {
    process.stderr.write(`esbuild launch error: ${result.error.message}\n`)
  }
  process.exit(result.status ?? 1)
}

/**
 * Resolves esbuild to a directly-executable binary.
 * Returns { exe, needsShell } so callers can set shell:true when needed.
 *
 * Resolution order (most reliable first):
 *  1. pnpm content-addressable store native binary (.exe on Windows, ELF on Linux/macOS)
 *  2. Standard node_modules/.bin (npm/yarn workspace layout)
 *  3. Global esbuild as last resort
 */
function resolveEsbuildExecutable() {
  const isWindows = process.platform === 'win32'
  const pnpmStore = resolve(repoRoot, 'node_modules/.pnpm')

  // 1. Native binary from pnpm CAS (works with spawnSync, no shell needed)
  if (existsSync(pnpmStore)) {
    const platformPkg = isWindows ? '@esbuild+win32-x64@' : process.platform === 'darwin' ? '@esbuild+darwin-x64@' : '@esbuild+linux-x64@'
    const platformDir = isWindows ? 'win32-x64' : process.platform === 'darwin' ? 'darwin-x64' : 'linux-x64'
    const exeName = isWindows ? 'esbuild.exe' : 'esbuild'
    for (const entry of readdirSync(pnpmStore, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(platformPkg)) continue
      const candidate = resolve(pnpmStore, entry.name, 'node_modules', '@esbuild', platformDir, exeName)
      if (existsSync(candidate)) return { exe: candidate, needsShell: false }
    }
  }

  // 2. Standard .bin — on Windows use node to invoke the JS launcher directly
  const esbuildPkg = resolve(repoRoot, 'node_modules/esbuild/bin/esbuild')
  if (existsSync(esbuildPkg)) {
    if (isWindows) {
      // On Windows, invoke as: node path/to/esbuild/bin/esbuild <args>
      // We need to prepend to args — do this via a wrapper command
      return { exe: esbuildPkg, needsShell: false, nodeWrapper: true }
    }
    return { exe: esbuildPkg, needsShell: false }
  }

  // 3. .pnpm virtual store package
  const pnpmEsbuildBin = resolve(pnpmStore, `esbuild@${getInstalledEsbuildVersion()}`, 'node_modules', 'esbuild', 'bin', 'esbuild')
  if (existsSync(pnpmEsbuildBin)) {
    return { exe: pnpmEsbuildBin, needsShell: false }
  }

  // 4. Global esbuild
  const globalExe = isWindows ? 'esbuild.exe' : 'esbuild'
  return { exe: globalExe, needsShell: false }
}

function getInstalledEsbuildVersion() {
  const pnpmStore = resolve(repoRoot, 'node_modules/.pnpm')
  if (!existsSync(pnpmStore)) return '0.0.0'
  for (const entry of readdirSync(pnpmStore, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('esbuild@')) {
      return entry.name.replace('esbuild@', '')
    }
  }
  return '0.0.0'
}

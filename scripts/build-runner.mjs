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

const result = spawnSync(esbuildExecutable, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  windowsHide: true,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

function resolveEsbuildExecutable() {
  const candidates = [
    resolve(repoRoot, 'node_modules/.pnpm/node_modules/.bin/esbuild'),
    resolve(repoRoot, 'node_modules/.bin/esbuild'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  const pnpmStore = resolve(repoRoot, 'node_modules/.pnpm')
  if (existsSync(pnpmStore)) {
    for (const entry of readdirSync(pnpmStore, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('@esbuild+win32-x64@')) {
        continue
      }

      const candidate = resolve(
        pnpmStore,
        entry.name,
        'node_modules',
        '@esbuild',
        'win32-x64',
        'esbuild.exe'
      )

      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  throw new Error('Could not find a local esbuild executable for the runner bundle.')
}

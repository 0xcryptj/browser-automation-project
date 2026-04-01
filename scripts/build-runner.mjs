import { existsSync } from 'node:fs'
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
    resolve(repoRoot, 'node_modules/.pnpm/@esbuild+win32-x64@0.27.4/node_modules/@esbuild/win32-x64/esbuild.exe'),
    resolve(repoRoot, 'node_modules/.pnpm/@esbuild+win32-x64@0.21.5/node_modules/@esbuild/win32-x64/esbuild.exe'),
    resolve(repoRoot, 'node_modules/.pnpm/node_modules/.bin/esbuild'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error('Could not find a local esbuild executable for the runner bundle.')
}

# Browser Automation - Local-First Browser Operator

This repo is a local-first browser operator made of:

- `packages/extension`: a Chrome/Brave MV3 extension with a side panel UI
- `packages/runner`: a localhost Fastify + Playwright runner
- `packages/shared`: shared Zod schemas and types

It uses an `Observe -> Plan -> Execute -> Verify` loop, streams task progress over SSE, keeps risky actions behind approval gates, and keeps provider credentials local to the user's machine.

## What works now

- stable Playwright browser/context/page reuse with automatic recreation
- sequential task execution without one failed task poisoning the next one
- live task streaming with clearer failed/cancelled/error states
- grounded planning with `mock`, `openai`, `anthropic`, or `ollama`
- local provider settings stored by the runner, not in the extension bundle
- task prompts such as:
  - `Go to https://example.com`
  - `Go to https://example.com and take a screenshot`
  - `Extract the main heading`
  - `Read the page`

## Prerequisites

- Node.js 20+
- pnpm 9+
- Chrome or Brave

## Setup

```powershell
pnpm install
copy packages\runner\.env.example packages\runner\.env
pnpm install:playwright
```

## Run the runner

```powershell
pnpm runner:dev
```

If PowerShell blocks `pnpm`, use `pnpm.cmd`.

If port `3000` is taken, set a different port in `packages/runner/.env`:

```env
RUNNER_PORT=3001
```

Then verify health:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health
```

The health response includes:

- runner status
- planner/provider status
- browser state
  - `browserConnected`
  - `contextOpen`
  - `pageOpen`
  - `pageCount`
  - `activePageUrl`

## Build and load the extension

```powershell
pnpm extension:build
```

Load this folder as unpacked:

- Chrome: `chrome://extensions`
- Brave: `brave://extensions`

Steps:

1. Enable **Developer mode**
2. Click **Load unpacked**
3. Select `packages/extension/dist`
4. Open the extension side panel from the toolbar button
5. In `Settings -> Runner`, set the runner URL to match your port, for example `http://localhost:3001`

## Provider configuration

Provider configuration is done in the extension side panel under `Settings -> Provider`.

Supported now:

- `Mock`
- `OpenAI`
- `Anthropic`
- `Ollama`

Planned next:

- `Groq`
- `Moonshot / Kimi`

### Security model

- API keys are never stored in the extension manifest or source code.
- Provider secrets are stored locally by the runner in:
  - `packages/runner/.local/planner-config.json`
  - or `RUNNER_CONFIG_PATH` if you set one
- The extension only talks to the runner over localhost.
- Saved secrets are redacted in the UI and health/settings responses.

### OpenAI

In `Settings -> Provider`:

- Provider: `OpenAI`
- Model: for example `gpt-4o`
- API key: your key
- Base URL: optional

You can also set fallback defaults in `packages/runner/.env`:

```env
PLANNER_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
```

### Anthropic

In `Settings -> Provider`:

- Provider: `Anthropic`
- Model: for example `claude-opus-4-6`
- API key: your key

Fallback env example:

```env
PLANNER_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-6
```

### Ollama

In `Settings -> Provider`:

- Provider: `Ollama`
- Model: for example `llama3.1`
- Local endpoint: usually `http://127.0.0.1:11434`

Fallback env example:

```env
PLANNER_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.1
```

## Usage flow

1. Open any normal web page
2. Open the side panel
3. Check the connection badge
4. Submit a task
5. Watch the live task card update through:
   - `planning`
   - `running`
   - `awaiting approval`
   - `done`
   - `failed`
   - `cancelled`

If the stream is interrupted, the extension now reconciles against the runner task state instead of leaving a stale pending card behind.

## Manual verification

Use these prompts in order:

1. `Go to https://example.com`
2. `Go to https://example.com and take a screenshot`
3. `Extract the main heading`
4. `Read the page`

Expected behavior:

- navigation succeeds
- screenshot task finishes as `done`
- heading extraction returns `Example Domain` on `example.com`
- `Read the page` extracts the main content instead of navigating to a nonsense page

Also verify:

- cancel a running task and confirm it ends as `cancelled`
- set a bad runner URL and confirm the side panel shows a clear offline message
- switch provider settings and confirm they persist locally
- refresh `Observe` and confirm forms, text blocks, and actionable elements appear
- use `Assist` on a date-heavy page and confirm extraction still works

## Useful commands

```powershell
pnpm runner:dev
pnpm extension:build
pnpm typecheck
pnpm build
```

If PowerShell requires it:

```powershell
pnpm.cmd runner:dev
pnpm.cmd extension:build
pnpm.cmd typecheck
```

## Windows notes

Find a process using a port:

```powershell
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

## Brave notes

- Load the same unpacked folder: `packages/extension/dist`
- The extension uses standard Chromium MV3 APIs and should work in Brave as an unpacked extension
- If your Brave build restricts side panel behavior differently, verify the side panel permission/UI behavior in `brave://extensions`

## Known limitations

- Cancellation is cooperative between steps; it does not currently interrupt a Playwright action already in flight
- Form filling is improved but still basic; there is no full resume-to-form semantic mapping yet
- Screenshot artifacts are captured, but there is not yet a dedicated artifact viewer
- Retry/recovery transparency in the UI is still lighter than a full production operator timeline
- `Groq` and `Moonshot/Kimi` are not implemented yet, though the provider model is structured so they can be added cleanly

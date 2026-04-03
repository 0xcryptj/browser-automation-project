# PROJECT MAP
> Generated: 2026-04-03 — REPO MAPPER agent
> Root: `C:\Users\joarb\OneDrive\Desktop\browser automation project`

---

## 1. Directory Structure

```
browser automation project/
├── package.json                        # Monorepo root — pnpm workspace scripts
├── pnpm-workspace.yaml                 # Declares packages/*
├── pnpm-lock.yaml                      # Lockfile
├── .npmrc                              # pnpm registry config
├── .pnpmfile.cjs                       # pnpm hook (dependency patching)
├── README.md                           # Project documentation
│
├── scripts/
│   └── build-runner.mjs               # esbuild bundler script for runner
│
├── tools/native-host/
│   ├── host.mjs                        # ★ Native messaging host (Node.js implementation)
│   ├── install-native-host.ps1        # PowerShell setup script (registers host in Windows registry)
│   ├── browser-automation-native-host.cmd  # CMD shim that calls host.mjs via node
│   ├── BrowserAutomationNativeHost.cs      # C# wrapper (alternative host, compiles to .exe)
│   └── browser-automation-native-host.exe  # Pre-compiled C# shim (calls host.mjs)
│
├── packages/shared/                   # @browser-automation/shared
│   ├── package.json                   # type="module"; main=./src/index.ts; no build output
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                   # ★ Barrel re-export of all schemas + pageSnapshot
│       ├── pageSnapshot.ts            # buildPageObservationScript() injected into browser pages
│       └── schemas/
│           ├── action.ts              # Action, ActionType, ActionSensitivity, SENSITIVE_ACTION_KEYWORDS
│           ├── browser.ts             # BrowserConnectionConfig* schemas + DEFAULT_BROWSER_CDP_URL
│           ├── events.ts              # TaskEvent discriminated union (SSE event types)
│           ├── observation.ts         # ObservedElement, PageObservation, CompactPageSnapshot, etc.
│           ├── profile.ts             # UserProfile, ExtensionSettings, HistoryEntry, ImportantInfoExtraction, DEFAULT_SETTINGS
│           ├── provider.ts            # PlannerProvider, PlannerProviderConfig*, DEFAULT_PROVIDER_MODELS, DEFAULT_OLLAMA_BASE_URL
│           └── task.ts               # TaskRequest, TaskPlan, ActionPlan, ActionStep, TaskResult, ApprovalRequest
│
├── packages/extension/                # @browser-automation/extension (Chrome MV3)
│   ├── package.json
│   ├── tsconfig.json                  # moduleResolution: bundler; jsx: react-jsx
│   ├── vite.config.ts                 # Vite MPA: sidepanel + service-worker + content-script
│   ├── manifest.json                  # MV3 manifest; permissions: activeTab, nativeMessaging, sidePanel, storage, tabs, scripting
│   ├── sidepanel.html                 # React app entry HTML
│   ├── icons/                         # Extension icons (16, 48, 128 + design files)
│   └── src/
│       ├── assets.d.ts                # Vite asset type declarations
│       ├── background/
│       │   └── service-worker.ts      # ★ Service worker: native host bridge, message routing, overlay dispatch
│       ├── content/
│       │   └── content-script.ts      # ★ Injected: DOM observation + task overlay (Shadow DOM)
│       ├── lib/
│       │   ├── runnerClient.ts        # ★ Type-safe HTTP client for runner API (fetch + chrome.runtime bridge)
│       │   └── storage.ts             # Typed chrome.storage wrappers (settings, profile, history)
│       └── sidepanel/
│           ├── main.tsx               # React root mount
│           ├── App.tsx                # ★ Root component: tab routing, runner health polling, task submission
│           ├── hooks/
│           │   └── useTaskStream.ts   # ★ SSE streaming hook; state machine for task lifecycle
│           ├── components/
│           │   ├── ApprovalModal.tsx   # Step approval UI
│           │   ├── FutureLoginScreen.tsx  # Placeholder for future auth
│           │   ├── LiveTaskView.tsx    # Renders streaming steps
│           │   ├── ResultDisplay.tsx   # Final task result display
│           │   ├── StatusBadge.tsx     # Runner connection indicator
│           │   ├── TaskInput.tsx       # Prompt input box
│           │   └── icons.tsx          # SVG icon components
│           └── panels/
│               ├── AssistPanel.tsx    # Assist mode: page extraction UI
│               ├── ObservationViewer.tsx  # Debug: raw page snapshot viewer
│               ├── SettingsPanel.tsx  # Runner URL, provider, profile settings
│               └── TaskHistory.tsx    # Past task list + rerun
│
├── packages/runner/                   # @browser-automation/runner (Node.js Fastify server)
│   ├── package.json                   # type="module"
│   ├── tsconfig.json
│   ├── .env.example                   # ★ Template; actual .env must be created manually
│   ├── .local/                        # Runtime-generated config (gitignored by convention)
│   │   ├── browser-config.json        # Saved browser connection mode/cdpUrl
│   │   ├── planner-config.json        # Saved provider/model/apiKey
│   │   ├── runner-autostart.log       # Native host launcher output
│   │   └── native-host/
│   │       └── com.browser_automation.host.json  # Registered native host manifest (auto-generated by install script)
│   └── src/
│       ├── index.ts                   # ★ Entrypoint: start Fastify, log config
│       ├── server.ts                  # Fastify factory: CORS + route registration
│       ├── config.ts                  # Zod-validated env config + plannerEnvDefaults
│       ├── events/
│       │   └── taskBus.ts             # ★ EventEmitter-based SSE bus with 5-min event replay buffer
│       ├── routes/
│       │   ├── health.ts              # GET /health, GET /debug/status
│       │   ├── task.ts                # ★ POST /task, GET /task/:id, GET /task/:id/stream (SSE), POST /task/:id/approve, POST /task/:id/cancel
│       │   ├── settings.ts            # GET/PUT /settings/browser, GET/PUT /settings/planner, DELETE /settings/planner/secret
│       │   └── assist.ts              # POST /assist/extract (ImportantInfoExtraction)
│       ├── automation/
│       │   ├── browserManager.ts      # ★ Playwright browser lifecycle: launch vs attach (CDP), session management
│       │   ├── observer.ts            # page.evaluate(buildPageObservationScript) → PageObservation
│       │   ├── executor.ts            # ★ Step-by-step Playwright execution with approval gates
│       │   ├── actions/
│       │   │   └── index.ts           # ★ All Playwright action handlers (goto, click, type, select, scroll, hover, press, extract, screenshot, ...)
│       │   └── planners/
│       │       ├── IPlanner.ts        # Interface: { name, plan(request) → TaskPlan }
│       │       ├── index.ts           # getPlanner() factory: anthropic → openai → ollama → mock
│       │       ├── MockPlanner.ts     # Heuristic/regex planner (no network)
│       │       ├── AnthropicPlanner.ts  # Claude via @anthropic-ai/sdk
│       │       ├── OpenAIPlanner.ts   # GPT via openai SDK
│       │       ├── OllamaPlanner.ts   # Local Ollama via fetch
│       │       ├── shared.ts          # buildPlannerInput(), parsePlanFromJson(), failedPlan()
│       │       └── prompts.ts         # SYSTEM_PROMPT_EXPORT + ASSIST_EXTRACTION_PROMPT
│       └── settings/
│           ├── browserConfigStore.ts  # Read/write .local/browser-config.json; probes CDP
│           └── plannerConfigStore.ts  # Read/write .local/planner-config.json; probes Ollama
│
└── [root log files]                   # runner-*.log, runner-smoke-*.json (operational noise)
```

---

## 2. Package Dependency Graph

```
                ┌────────────────────────┐
                │  @browser-automation/  │
                │       shared           │
                │  (zod schemas only)    │
                └──────────┬─────────────┘
                           │ workspace:*
              ┌────────────┼───────────────────┐
              │                                │
┌─────────────▼────────────┐   ┌──────────────▼────────────┐
│ @browser-automation/     │   │ @browser-automation/      │
│    extension             │   │       runner              │
│  (Vite + React, MV3)     │   │  (Fastify + Playwright)   │
│                          │   │                           │
│ deps: shared, nanoid,    │   │ deps: shared, fastify,    │
│   react, react-dom, zod  │   │   playwright, anthropic,  │
│                          │   │   openai, dotenv, zod,    │
│ devDeps: vite, @vitejs/  │   │   nanoid, pino-pretty     │
│   plugin-react, @types/  │   │                           │
│   chrome, typescript     │   │ devDeps: tsx, @types/node │
└──────────────────────────┘   └───────────────────────────┘
```

**Note:** `shared` has `main: ./src/index.ts` — it is consumed directly as TypeScript source,
not compiled. Both packages import shared types via `@browser-automation/shared` resolved by
pnpm workspace and TypeScript `moduleResolution: bundler`.

---

## 3. Message Flow: Extension ↔ Runner API ↔ Playwright

```
User types prompt
        │
        ▼
[sidepanel/App.tsx] handleSubmit()
        │ chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT' })
        │
        ▼
[service-worker.ts] → [content-script.ts] COLLECT_CONTEXT
        │                    │ collectContext() → buildPageObservationScript()
        │                    │     (executes in page DOM)
        │                    └──── returns PageObservation
        │
        ▼
[useTaskStream.ts] submitTask(prompt, observation, mode)
        │ runnerClient.submitTask({ id, prompt, mode, url, observation })
        │  POST /task  →  [runner: routes/task.ts]
        │
        ▼
[runner/routes/task.ts] POST /task
        │ Validates TaskRequest via Zod
        │ getPlanner() → MockPlanner / AnthropicPlanner / OpenAIPlanner / OllamaPlanner
        │ planner.plan(taskRequest) → TaskPlan
        │ enqueueExecution(taskPlan)   [async, returns 202 immediately]
        │ ← { taskId, plan }
        │
        ▼
[extension: useTaskStream] openStream(taskId)
        │ new EventSource(`/task/${taskId}/stream`)
        │
        ▼
[runner/routes/task.ts] GET /task/:id/stream
        │ taskBus.subscribe(id, handler, onReplay)
        │
        ▼
[runner/automation/executor.ts] execute(plan)
        │ ensureBrowserSession()  →  browserManager.ts
        │     launch (headless Chromium) OR attach (CDP URL)
        │
        ▼ for each step:
[runner/automation/actions/index.ts] runAction(page, action, context)
        │ Playwright: goto / click / type / select / scroll / hover / press / extract / screenshot
        │
        ▼ after each step:
[taskBus.publish(TaskEvent)]
        │ → SSE stream to extension
        │
        ▼
[extension: useTaskStream applyEvent()]
        │ Updates StreamState (steps, status, pendingApproval)
        │ Triggers syncOverlay() → chrome.runtime.sendMessage(TASK_OVERLAY_SHOW)
        │
        ▼
[service-worker.ts] → [content-script.ts] TASK_OVERLAY_SHOW
        │ showOverlay(payload) — Shadow DOM ring/badge/cursor
        │
        ▼ (if requiresApproval)
[extension: ApprovalModal] user clicks Approve/Deny
        │ runnerClient.approve(taskId, stepIndex, approved)
        │  POST /task/:id/approve
        │ openStream(taskId) — re-subscribe
        │
        ▼ (task ends)
[taskBus.publish({ type: 'task_completed' | 'task_failed' | 'task_cancelled' })]
        │ SSE stream closes after 300ms grace
        │
        ▼
[extension: addHistoryEntry()] → chrome.storage.local
```

---

## 4. SSE Streaming Flow

```
Client (EventSource)               Server (Fastify raw response)
─────────────────────────────────────────────────────────────────
GET /task/:id/stream
                            ← HTTP 200 text/event-stream; charset=utf-8
                            ← Cache-Control: no-cache, no-transform
                            ← Connection: keep-alive
                            ← X-Accel-Buffering: no

                            ← data: {"type":"connected","taskId":"..."}\n\n
    [onmessage: connected]

                            ← data: {"type":"task_started",...}\n\n
    [onmessage: task_started]

                            ← data: {"type":"plan_created",...}\n\n
    [onmessage: plan_created]

                            ← data: {"type":"step_started",...}\n\n
    [onmessage: step_started]  → overlay shown

                            ← data: {"type":"step_succeeded",...}\n\n
    [onmessage: step_succeeded]

                            ← data: {"type":"approval_required",...}\n\n
    [onmessage: approval_required]  → ApprovalModal shown

    POST /task/:id/approve  →
    EventSource.close()
    new EventSource(...)    →  [re-subscribes; buffered events replayed]

                            ← data: {"type":"task_completed",...}\n\n
    [onmessage: task_completed]
    EventSource.close() after 400ms

                            ← : ping\n\n   (every 20s keepalive)
```

**Replay mechanism:** `taskBus` buffers all events per taskId for 5 minutes.
When a client subscribes late (or re-subscribes after approval), `onReplay` fires
synchronously with all past events before live events resume.

---

## 5. Key Entry Points

| Context | Entry Point | Bundler |
|---|---|---|
| Extension UI | `packages/extension/src/sidepanel/main.tsx` | Vite |
| Extension background | `packages/extension/src/background/service-worker.ts` | Vite |
| Content script | `packages/extension/src/content/content-script.ts` | Vite |
| Runner (dev) | `packages/runner/src/index.ts` (via `tsx watch`) | tsx |
| Runner (prod) | `packages/runner/dist/index.js` | esbuild bundle |
| Native host | `tools/native-host/host.mjs` | Node ESM (no bundle) |

---

## 6. Native Messaging Host Flow

```
Extension service-worker
    │ chrome.runtime.sendNativeMessage('com.browser_automation.host', payload)
    │
    ▼
Windows Registry
    HKCU\Software\Google\Chrome\NativeMessagingHosts\com.browser_automation.host
    → path = tools/native-host/browser-automation-native-host.exe
    │
    ▼
browser-automation-native-host.exe  (C# shim OR .cmd shim)
    │ Forwards stdin/stdout to: node tools/native-host/host.mjs
    │
    ▼
host.mjs (readNativeMessage → writeNativeMessage protocol)
    │
    ├─ type: "ensure-runner"
    │       1. Try GET {runnerBaseUrl}/health
    │       2. If fails → launchRunner() (detached node process)
    │       3. waitForHealth() polls /health every 1s up to 20s
    │       4. Returns { ok, launched, health, logPath }
    │
    └─ type: "ensure-browser-attach"
            1. Try GET {cdpUrl}/json/version (1.5s timeout)
            2. If fails → stopBrowserProcesses() (taskkill)
            3. launchBrowserForAttach() with --remote-debugging-port
            4. waitForCdp() polls /json/version every 1s up to 20s
            5. Returns { ok, launched, browser, cdpUrl, executable, logPath }

Native host manifest: packages/runner/.local/native-host/com.browser_automation.host.json
    → allowed_origins: ["chrome-extension://ihpcbjfbbiimknfdhibcgkcfcbkhohah/"]
    → path: tools/native-host/browser-automation-native-host.exe
```

---

## 7. Shared Schema Exports (`packages/shared/src/index.ts`)

All exports are re-exported from `index.ts`. Completeness check:

| File | Key Exports |
|---|---|
| `schemas/action.ts` | `Action`, `ActionType`, `ActionSensitivity`, `SENSITIVE_ACTION_KEYWORDS` |
| `schemas/browser.ts` | `BrowserConnectionMode`, `BrowserConnectionConfigInput/Stored/Public`, `DEFAULT_BROWSER_CDP_URL` |
| `schemas/events.ts` | `TaskEvent` (discriminated union of 11 event types) |
| `schemas/observation.ts` | `ObservationOptions`, `ObservedElement`, `ObservedForm`, `CompactPageSnapshot`, `PageObservation`, `ObservationCaptureMode`, `ObservedElementKind`, etc. |
| `schemas/profile.ts` | `UserProfile`, `ExtensionSettings`, `DEFAULT_SETTINGS`, `HistoryEntry`, `ImportantInfoExtraction`, `ImportantDate` |
| `schemas/provider.ts` | `PlannerProvider`, `SupportedPlannerProvider`, `PlannerProviderConfig*`, `DEFAULT_PROVIDER_MODELS`, `DEFAULT_OLLAMA_BASE_URL` |
| `schemas/task.ts` | `TaskRequest`, `TaskPlan`, `ActionPlan`, `ActionStep`, `PlannedActionStep`, `TaskResult`, `ApprovalRequest`, `StepStatus`, `TaskContext`, `ActionResult`, `UserProfileSummary` |
| `pageSnapshot.ts` | `buildPageObservationScript()`, `getDefaultObservationOptions()` |

**Assessment: Schema exports are COMPLETE.** Every type used by extension and runner is exported.

---

## 8. Build Pipeline Assessment

### Extension (Vite)
```
vite build
  Input:  sidepanel.html + service-worker.ts + content-script.ts
  Output: dist/
    sidepanel.html → assets/sidepanel-[hash].js
    background.js  (fixed name via entryFileNames override)
    content-script.js (fixed name)
    icons/         (copied via writeBundle plugin)
    manifest.json  (copied via writeBundle plugin)
  Target: chrome112
```
✅ **Sound.** The `copyExtensionAssets` Vite plugin correctly copies `manifest.json` and `icons/`.
`@shared` alias in `vite.config.ts` points to `../shared/src` which is valid.
⚠️ **Minor:** `@shared` alias is defined in vite.config but not in `tsconfig.json`. TypeScript will resolve via the `@browser-automation/shared` workspace package instead — this is fine for type-checking but the alias is redundant.

### Runner (esbuild)
```
node scripts/build-runner.mjs
  Input:  packages/runner/src/index.ts
  Output: packages/runner/dist/index.js
  Format: ESM; Platform: node20
  Externals: playwright, fastify, @fastify/cors, dotenv, nanoid, openai, @anthropic-ai/sdk, pino-pretty, zod
```
✅ **Sound.** All heavy dependencies are externalized correctly — they are present in `node_modules` and don't need bundling.
⚠️ **Minor:** esbuild executable resolution searches two candidate paths + a pnpm store scan. This is brittle on CI but works locally.

---

## 9. Import Correctness Check

### Runner `.ts` files import with `.js` extensions (correct for ESM Node)
All runner internal imports use `.js` extension (e.g., `import { config } from './config.js'`) — correct for Node ESM.

### Planner files use `.ts` extensions for internal imports
`AnthropicPlanner.ts`, `OpenAIPlanner.ts`, `OllamaPlanner.ts`, `MockPlanner.ts` all import:
```ts
import type { IPlanner } from './IPlanner.ts'    // ← .ts extension
import { ... } from './prompts.ts'               // ← .ts extension
import { ... } from './shared.ts'                // ← .ts extension
```
✅ Allowed by `allowImportingTsExtensions: true` in tsconfig. Works for `tsx` dev mode.
⚠️ **Build concern:** esbuild handles `.ts` imports fine when bundling. No issue at runtime with the compiled output.

### `shared` package imports use `.ts` extensions
`index.ts` re-exports from `./schemas/action.ts` etc. — correct, since shared is consumed as raw TypeScript source.

### No missing import targets found.
Every imported module file exists on disk. No orphaned imports detected.

---

## 10. Circular Dependency Check

Analyzed import graph:

```
executor.ts  →  actions/index.ts      ✅ one-way
executor.ts  →  observer.ts           ✅ one-way
executor.ts  →  taskBus.ts            ✅ one-way
executor.ts  →  browserManager.ts     ✅ one-way
planners/index.ts  →  planners/*.ts   ✅ one-way
routes/task.ts  →  taskBus.ts         ✅ one-way
routes/task.ts  →  executor.ts        ✅ one-way
routes/assist.ts  →  planners/prompts.ts  ✅ one-way
```

**No circular dependencies detected.**

---

## 11. Dead Code / Unused Exports / Orphaned Files

### Potentially unused exports
- `UserProfileSummary` (exported from `task.ts` via `shared/index.ts`) — referenced in type docs but not visibly consumed by any planner or route. **Likely dead.**
- `WorkEntry`, `EducationEntry` from `profile.ts` — exported but not used by any planner or route. Only used as sub-schemas inside `UserProfile`. Technically needed, not dead.
- `ObservedLink`, `ObservedTextBlock`, `ObservedFormField`, `ObservedForm` from `observation.ts` — exported but `PageObservation` uses them inline; extension/runner consumers reference `PageObservation` directly. Low risk.
- `SupportedPlannerProvider` from `provider.ts` — exported but only `PlannerProvider` is used in planner code. **Possibly dead.**

### Orphaned / Noise files at root level
- `runner-*.log`, `runner-smoke-*.json`, `runner-start-*.log`, `runner-dev-*.log` — **operational log leftovers at project root.** Should be moved to a `logs/` directory or gitignored.

### Design asset files
- `packages/extension/icons/bender.PNG`, `packages/extension/icons/better icon.png`, `packages/extension/icons/comparison.PNG` — design/reference files not referenced in `manifest.json`. Safe to keep but not deployed.

### `FutureLoginScreen.tsx`
- Present and imported in `App.tsx` as a placeholder for auth. Not dead code per se but a stub.

### `ResultDisplay.tsx`
- Exists as a component but not imported anywhere in `App.tsx` or other panels. **Potentially dead code / unused component.**

---

## 12. Missing Files That Should Exist

| File | Status | Action |
|---|---|---|
| `packages/runner/.env` | ❌ MISSING | Copy from `.env.example` and fill in `PLANNER_PROVIDER` + API key |
| `.gitignore` | ❌ MISSING at root | Should ignore: `node_modules/`, `dist/`, `*.log`, `*.out.log`, `*.err.log`, `.local/`, `runner-*.json`, `runner-smoke-*.json` |
| `packages/extension/src/sidepanel/main.tsx` | ✅ exists | — |
| `packages/runner/dist/index.js` | ❌ not present (must build) | Run `pnpm runner:build` |
| `.claude/settings.local.json` | ✅ exists (Claude AI project config) | — |

---

## 13. Structural Issues Summary

### 🔴 Critical
1. **`.env` is missing** from `packages/runner/`. The runner defaults to `PLANNER_PROVIDER=mock` via config.ts default, so it _works_ without `.env`, but any production/AI usage requires the file.
2. **No `.gitignore`** — the `runner-*.log` / `runner-smoke-*.json` files at root and `.local/` secrets folder would be committed to git if a repo is initialized.

### 🟡 Warnings
3. **Log files at project root** (`runner-3001.out.log`, `runner-dev.err.log`, etc.) — should be in a `logs/` subfolder or cleaned up.
4. **`ResultDisplay.tsx` appears unused** — imported by nothing in the current codebase. Verify or remove.
5. **`UserProfileSummary` and `SupportedPlannerProvider`** exported from shared but not consumed. Remove or document intended future use.
6. **Native host `.exe` path is hardcoded** in `.local/native-host/com.browser_automation.host.json` to a specific absolute Windows path. This will break if the project is moved or run by another user. The `install-native-host.ps1` script must be re-run when the project moves.
7. **`allowed_origins`** in the native host manifest is hardcoded to one extension ID (`ihpcbjfbbiimknfdhibcgkcfcbkhohah`). This breaks if the extension is reloaded unpacked from a different machine or Chrome profile (which generates a new ID).
8. **esbuild shared package**: `@browser-automation/shared` is NOT in the externals list for esbuild. This means its source is inlined into `dist/index.js`, which is correct and intentional since shared has no compiled output. ✅ No issue.
9. **Task cancellation race**: `POST /task/:id/cancel` publishes `task_cancelled` and sets plan status to `cancelled`, but the in-flight `executor.ts` only checks `cancelledTasks.has(plan.id)` at each step boundary. A long-running `goto` or `extract` won't be interrupted mid-await.

### 🟢 Working Correctly
- Shared schema exports: complete and consistent.
- SSE replay buffer: correctly handles late subscriber reconnections.
- Approval gate: both pre-execution and mid-execution gates are implemented.
- CORS: properly restricts to `chrome-extension://` and localhost origins.
- Browser session management: handles launch vs attach mode with fallback.
- Planner selection: priority chain `anthropic → openai → ollama → mock` with readiness probing.
- Content script overlay: Shadow DOM isolation, correct cleanup on task end.
- `buildPageObservationScript` in shared: used both in content-script (browser) and observer.ts (Playwright `page.evaluate`) — the function returns a serializable script, which is the correct pattern.

---

## 14. Files Created by This Agent

- `PROJECT_MAP.md` — this file (at project root)

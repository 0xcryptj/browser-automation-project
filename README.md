# Browser Automation — Local-First AI Browser Operator

A Chrome extension + localhost runner that automates browser tasks using a structured
**Observe → Plan → Execute → Verify → Recover** loop. No cloud, no API keys in the extension.

## Architecture

```
┌─────────────────────────────────┐     HTTP/localhost      ┌──────────────────────────┐
│  Chrome Extension (MV3)         │ ◄──────────────────────► │  Runner (Fastify)        │
│  ─ Side Panel (React)           │   POST /task             │  ─ Planner (mock/LLM)    │
│  ─ Background Service Worker    │   POST /task/:id/approve │  ─ Executor (Playwright) │
│  ─ Content Script               │   GET  /health           │  ─ Observer              │
└─────────────────────────────────┘                          └──────────────────────────┘
         │                                                            │
   Collects page                                              Controls Chromium
   context (URL,                                             browser via Playwright
   title, elements)
```

## Packages

| Package | Description |
|---------|-------------|
| `packages/shared` | Zod schemas: `TaskRequest`, `PageObservation`, `ActionStep`, `Action`, `TaskResult` |
| `packages/runner` | Fastify HTTP server + Playwright automation engine |
| `packages/extension` | Chrome MV3 extension — side panel UI, service worker, content script |

## Prerequisites

- Node.js 20+
- pnpm 9+
- Google Chrome

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Install Playwright's Chromium browser
pnpm install:playwright

# 3. Start the runner (keep this terminal open)
pnpm runner:dev

# 4. Build the extension
pnpm extension:build
```

## Loading the Extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `packages/extension/dist`
5. Click the extension icon in the toolbar → side panel opens

## Usage

1. Start the runner: `pnpm runner:dev`
2. Open Chrome, click the extension icon
3. The side panel shows **Connected** when the runner is reachable
4. Type a task prompt and press Enter or click **Run Task**

### Example prompts

```
Go to https://example.com and take a screenshot
Search for TypeScript tutorials on google.com
Go to news.ycombinator.com and extract the page title
Scroll down on the current page
```

## Supported Actions

| Action | What it does |
|--------|-------------|
| `goto` | Navigate to a URL |
| `click` | Click an element |
| `type` | Fill an input field |
| `select` | Choose a `<select>` option |
| `scroll` | Scroll the page |
| `hover` | Hover over an element |
| `press` | Press a keyboard key |
| `wait_for_selector` | Wait for an element to appear |
| `wait_for_text` | Wait for text to appear |
| `extract` | Extract text from an element |
| `screenshot` | Capture a screenshot |

## Sensitive Action Approval

Actions involving keywords like `submit`, `delete`, `payment`, `send`, `purchase` automatically
require user approval before execution. An approval modal is shown in the side panel.

## Development

```bash
# Watch-rebuild the extension on changes
pnpm extension:dev

# Run the runner in dev (auto-restart on changes)
pnpm runner:dev

# Type-check everything
pnpm -r build
```

## API Endpoints

```
GET  /health                 → runner status
POST /task                   → submit a task
GET  /task/:id               → get task state
POST /task/:id/approve       → approve/deny a pending step
```

### POST /task

```json
{
  "id": "abc123",
  "prompt": "Go to google.com and search for cats",
  "url": "https://google.com",
  "title": "Google"
}
```

## Replacing the Mock Planner

The planner in `packages/runner/src/automation/planner.ts` uses keyword heuristics.
To use a real LLM, replace the `plan()` function with a call to Claude, GPT-4, etc.,
passing `request.prompt` and `request.observation` as context.

## Project Structure

```
packages/
  shared/src/schemas/
    action.ts          # Action, ActionType, SENSITIVE_ACTION_KEYWORDS
    observation.ts     # PageObservation, ObservedElement
    task.ts            # TaskRequest, ActionStep, TaskPlan, TaskResult, ApprovalRequest
  runner/src/
    automation/
      observer.ts      # Collect page state from Playwright
      planner.ts       # Prompt → ActionStep[] (swap for LLM)
      executor.ts      # Execute plan with Observe→Plan→Execute→Verify→Recover
      actions/index.ts # All action handlers
    routes/
      health.ts
      task.ts
    server.ts
    index.ts
  extension/src/
    background/service-worker.ts   # Message broker + runner fetch
    content/content-script.ts      # Page context collector
    sidepanel/
      App.tsx                      # Main UI + approval flow
      components/
        TaskInput.tsx
        ResultDisplay.tsx
        ApprovalModal.tsx
        StatusBadge.tsx
```

import type { TaskRequest, ActionStep, TaskPlan } from '@browser-automation/shared'
import { SENSITIVE_ACTION_KEYWORDS } from '@browser-automation/shared'

/**
 * Mock planner: parses the prompt with simple heuristics and returns a structured plan.
 * Replace this with an LLM call (Claude, GPT-4, etc.) in production.
 */
export function plan(request: TaskRequest): TaskPlan {
  const prompt = request.prompt.toLowerCase()
  const steps: ActionStep[] = []

  // ── URL navigation ─────────────────────────────────────────────────────
  const urlMatch = request.prompt.match(/https?:\/\/[^\s]+/i)
  const gotoMatch = prompt.match(/(?:go to|navigate to|open|visit)\s+([\w.-]+\.[a-z]{2,}[^\s]*)/i)

  let targetUrl: string | null = urlMatch?.[0] ?? null
  if (!targetUrl && gotoMatch) {
    const raw = gotoMatch[1]
    targetUrl = raw.startsWith('http') ? raw : `https://${raw}`
  }
  if (!targetUrl && request.url) targetUrl = request.url

  if (targetUrl) {
    steps.push({
      step: steps.length,
      action: {
        type: 'goto',
        url: targetUrl,
        description: `Navigate to ${targetUrl}`,
        requiresApproval: false,
      },
      status: 'pending',
    })
  }

  // ── Search / type ──────────────────────────────────────────────────────
  const searchMatch = prompt.match(/search (?:for )?["']?([^"'\n]+?)["']?(?:\s+on\s+\w+)?$/)
  const typeMatch = prompt.match(/type\s+["']([^"']+)["']\s+(?:in|into)\s+(.+)/)

  if (searchMatch && !typeMatch) {
    const query = searchMatch[1].trim()
    // Common search input selectors
    const selector = 'input[type="search"], input[name="q"], input[name="search"], input[type="text"]'
    steps.push({
      step: steps.length,
      action: {
        type: 'type',
        selector,
        value: query,
        description: `Type search query: "${query}"`,
        requiresApproval: false,
      },
      status: 'pending',
    })
    steps.push({
      step: steps.length,
      action: {
        type: 'press',
        selector,
        key: 'Enter',
        description: 'Submit search',
        requiresApproval: false,
      },
      status: 'pending',
    })
  }

  if (typeMatch) {
    const value = typeMatch[1]
    const selectorHint = typeMatch[2].trim()
    steps.push({
      step: steps.length,
      action: {
        type: 'type',
        selector: selectorHint,
        value,
        description: `Type "${value}" into ${selectorHint}`,
        requiresApproval: false,
      },
      status: 'pending',
    })
  }

  // ── Click ──────────────────────────────────────────────────────────────
  const clickMatch = prompt.match(/click\s+(?:on\s+)?["']?([^"'\n]+?)["']?$/)
  if (clickMatch) {
    const target = clickMatch[1].trim()
    const isSensitive = SENSITIVE_ACTION_KEYWORDS.some((k) => target.includes(k))
    steps.push({
      step: steps.length,
      action: {
        type: 'click',
        selector: `text=${target}`,
        description: `Click "${target}"`,
        requiresApproval: isSensitive,
      },
      status: 'pending',
    })
  }

  // ── Scroll ─────────────────────────────────────────────────────────────
  if (prompt.includes('scroll down')) {
    steps.push({
      step: steps.length,
      action: { type: 'scroll', direction: 'down', amount: 600, description: 'Scroll down', requiresApproval: false },
      status: 'pending',
    })
  }
  if (prompt.includes('scroll up')) {
    steps.push({
      step: steps.length,
      action: { type: 'scroll', direction: 'up', amount: 600, description: 'Scroll up', requiresApproval: false },
      status: 'pending',
    })
  }

  // ── Extract ────────────────────────────────────────────────────────────
  const extractMatch = prompt.match(/extract\s+(?:the\s+)?(?:text\s+(?:from|of)\s+)?(.+)/)
  if (extractMatch) {
    const target = extractMatch[1].trim()
    steps.push({
      step: steps.length,
      action: {
        type: 'extract',
        selector: target.startsWith('#') || target.startsWith('.') ? target : `text=${target}`,
        description: `Extract text from "${target}"`,
        requiresApproval: false,
      },
      status: 'pending',
    })
  }

  // ── Screenshot ────────────────────────────────────────────────────────
  if (prompt.includes('screenshot') || prompt.includes('capture')) {
    steps.push({
      step: steps.length,
      action: { type: 'screenshot', description: 'Capture screenshot', requiresApproval: false },
      status: 'pending',
    })
  }

  // ── Fallback: observe + screenshot if no steps derived ────────────────
  if (steps.length === 0) {
    steps.push({
      step: 0,
      action: { type: 'screenshot', description: 'Capture current page state', requiresApproval: false },
      status: 'pending',
    })
  }

  // Always end with a screenshot for verification
  const lastAction = steps[steps.length - 1]?.action
  if (lastAction?.type !== 'screenshot') {
    steps.push({
      step: steps.length,
      action: { type: 'screenshot', description: 'Capture final page state', requiresApproval: false },
      status: 'pending',
    })
  }

  const hasApproval = steps.some((s) => s.action.requiresApproval)

  return {
    id: request.id,
    prompt: request.prompt,
    steps,
    status: hasApproval ? 'awaiting_approval' : 'planned',
    summary: `${steps.length} steps planned for: "${request.prompt}"`,
    createdAt: Date.now(),
  }
}

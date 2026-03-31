/**
 * MockPlanner — keyword/regex heuristic planner.
 * Used when no LLM provider is configured, or as a fallback.
 * No network calls; returns immediately.
 */
import type { CompactPageSnapshot, TaskRequest, TaskPlan, ActionStep } from '@browser-automation/shared'
import { SENSITIVE_ACTION_KEYWORDS } from '@browser-automation/shared'
import type { IPlanner } from './IPlanner.ts'

export class MockPlanner implements IPlanner {
  readonly name = 'mock'

  async plan(request: TaskRequest): Promise<TaskPlan> {
    const prompt = request.prompt.toLowerCase()
    const snapshot = request.observation?.snapshot
    const steps: ActionStep[] = []
    const isReadingTask =
      prompt.includes('read the page') ||
      prompt.includes('read this page') ||
      prompt.includes('summarize this page') ||
      prompt.includes('what is this page')

    // ── URL navigation ───────────────────────────────────────────────────
    const urlMatch = request.prompt.match(/https?:\/\/[^\s]+/i)
    const gotoMatch = prompt.match(
      /(?:go to|navigate to|open|visit)\s+([\w.-]+\.[a-z]{2,}[^\s]*)/i
    )
    let targetUrl: string | null = urlMatch?.[0] ?? null
    if (!targetUrl && gotoMatch) {
      const raw = gotoMatch[1]
      targetUrl = raw.startsWith('http') ? raw : `https://${raw}`
    }
    if (!targetUrl && request.url && prompt.includes('go to')) targetUrl = request.url

    if (targetUrl) {
      steps.push(makeStep(steps.length, {
        type: 'goto',
        url: targetUrl,
        description: `Navigate to ${targetUrl}`,
        requiresApproval: false,
        sensitivity: 'none',
      }))
    }

    // ── Search / type ────────────────────────────────────────────────────
    const searchMatch = prompt.match(/search (?:for )?["']?([^"'\n]+?)["']?(?:\s+on\s+\w+)?$/)
    const typeMatch = prompt.match(/type\s+["']([^"']+)["']\s+(?:in|into)\s+(.+)/)

    if (searchMatch && !typeMatch) {
      const query = searchMatch[1].trim()
      const sel = 'input[type="search"], input[name="q"], input[name="search"], input[type="text"]'
      steps.push(makeStep(steps.length, {
        type: 'type',
        selector: sel,
        value: query,
        description: `Type search query: "${query}"`,
        requiresApproval: false,
        sensitivity: 'none',
      }))
      steps.push(makeStep(steps.length, {
        type: 'press',
        selector: sel,
        key: 'Enter',
        description: 'Submit search',
        requiresApproval: false,
        sensitivity: 'none',
      }))
    }

    if (typeMatch) {
      const field = findFieldRef(snapshot, typeMatch[2].trim())
      steps.push(makeStep(steps.length, {
        type: 'type',
        elementRef: field?.ref,
        selector: field?.selector ?? typeMatch[2].trim(),
        value: typeMatch[1],
        description: `Type "${typeMatch[1]}" into ${field?.label ?? typeMatch[2].trim()}`,
        requiresApproval: false,
        sensitivity: 'none',
      }))
    }

    // ── Click ─────────────────────────────────────────────────────────────
    const clickMatch = prompt.match(/click\s+(?:on\s+)?["']?([^"'\n]+?)["']?$/)
    if (clickMatch) {
      const target = clickMatch[1].trim()
      const isSensitive = SENSITIVE_ACTION_KEYWORDS.some((k) => target.includes(k))
      const element = findElementRef(snapshot, target, ['button', 'link', 'actionable'])
      steps.push(makeStep(steps.length, {
        type: 'click',
        elementRef: element?.ref,
        selector: element?.selector ?? `text=${target}`,
        description: `Click "${target}"`,
        requiresApproval: isSensitive,
        sensitivity: isSensitive ? 'submit' : 'none',
        approvalReason: isSensitive ? `"${target}" appears to be a sensitive action` : undefined,
      }))
    }

    // ── Scroll ────────────────────────────────────────────────────────────
    if (prompt.includes('scroll down')) {
      steps.push(makeStep(steps.length, { type: 'scroll', direction: 'down', amount: 600, description: 'Scroll down', requiresApproval: false, sensitivity: 'none' }))
    }
    if (prompt.includes('scroll up')) {
      steps.push(makeStep(steps.length, { type: 'scroll', direction: 'up', amount: 600, description: 'Scroll up', requiresApproval: false, sensitivity: 'none' }))
    }

    // ── Extract ───────────────────────────────────────────────────────────
    const extractMatch = prompt.match(/extract\s+(?:the\s+)?(?:text\s+(?:from|of)\s+)?(.+)/)
    if (extractMatch) {
      const target = extractMatch[1].trim()
      const extractTarget = inferExtractTarget(target, request)
      steps.push(makeStep(steps.length, {
        type: 'extract',
        elementRef: extractTarget.ref,
        selector: extractTarget.selector,
        description: `Extract text from "${target}"`,
        requiresApproval: false,
        sensitivity: 'none',
      }))
    }

    if (isReadingTask && steps.length === 0) {
      const readableTarget = inferReadableTarget(request)
      steps.push(makeStep(steps.length, {
        type: 'extract',
        elementRef: readableTarget.ref,
        selector: readableTarget.selector,
        description: 'Read the main page content',
        requiresApproval: false,
        sensitivity: 'none',
      }))
    }

    // ── Screenshot ────────────────────────────────────────────────────────
    if (prompt.includes('screenshot') || prompt.includes('capture')) {
      steps.push(makeStep(steps.length, {
        type: 'screenshot',
        description: 'Capture screenshot',
        requiresApproval: false,
        sensitivity: 'none',
      }))
    }

    // ── Fallback ──────────────────────────────────────────────────────────
    if (steps.length === 0) {
      steps.push(makeStep(0, { type: 'screenshot', description: 'Capture current page state', requiresApproval: false, sensitivity: 'none' }))
    }

    // Always end with a screenshot for verification
    const last = steps[steps.length - 1]
    if (!isReadingTask && last?.action.type !== 'screenshot') {
      steps.push(makeStep(steps.length, { type: 'screenshot', description: 'Capture final page state', requiresApproval: false, sensitivity: 'none' }))
    }

    const hasApproval = steps.some((s) => s.action.requiresApproval)

    return {
      id: request.id,
      prompt: request.prompt,
      steps,
      context: request.observation
        ? {
            url: request.url ?? request.observation.url,
            title: request.title ?? request.observation.title,
            snapshot: request.observation.snapshot,
          }
        : {
            url: request.url,
            title: request.title,
          },
      status: hasApproval ? 'awaiting_approval' : 'planned',
      summary: `${steps.length} steps planned for: "${request.prompt}"`,
      plannerUsed: this.name,
      createdAt: Date.now(),
    }
  }
}

type PartialAction = {
  type: string
  description: string
  url?: string
  elementRef?: string
  selector?: string
  value?: string
  key?: string
  direction?: string
  amount?: number
  requiresApproval: boolean
  sensitivity: string
  approvalReason?: string
}

function makeStep(index: number, action: PartialAction): ActionStep {
  return {
    step: index,
    action: action as ActionStep['action'],
    status: 'pending',
  }
}

function inferExtractTarget(target: string, request: TaskRequest): { ref?: string; selector: string } {
  const normalized = target.trim().toLowerCase()
  const snapshot = request.observation?.snapshot

  if (normalized === 'main heading' || normalized === 'heading' || normalized === 'headline') {
    const heading = findElementRef(snapshot, normalized, ['text'])
      ?? snapshot?.elements.find((element) => element.kind === 'text' && /^h1/i.test(element.selector ?? ''))
    return {
      ref: heading?.ref,
      selector: heading?.selector ?? 'h1',
    }
  }

  if (normalized === 'page title' || normalized === 'title') {
    return { selector: 'title' }
  }

  const directMatch = findElementRef(snapshot, target, ['text', 'main', 'link', 'button', 'actionable'])
  if (directMatch?.selector) {
    return { ref: directMatch.ref, selector: directMatch.selector }
  }

  if (
    normalized.startsWith('#') ||
    normalized.startsWith('.') ||
    normalized.startsWith('[')
  ) {
    return { selector: target }
  }

  return { selector: `text=${target}` }
}

function inferReadableTarget(request: TaskRequest): { ref?: string; selector: string } {
  const snapshot = request.observation?.snapshot
  if (snapshot?.mainContentRef) {
    const main = snapshot.elements.find((element) => element.ref === snapshot.mainContentRef)
    if (main?.selector) {
      return { ref: main.ref, selector: main.selector }
    }
  }

  if (snapshot?.mainContentSelector) {
    return { ref: snapshot.mainContentRef, selector: snapshot.mainContentSelector }
  }

  const observation = request.observation

  if (observation?.headings?.length) {
    return { selector: 'main, article, [role="main"], body' }
  }

  if (observation?.textBlocks?.some((block) => block.selector.includes('main'))) {
    return { selector: 'main' }
  }

  if (observation?.textBlocks?.some((block) => block.selector.includes('article'))) {
    return { selector: 'article' }
  }

  return { selector: 'main, article, [role="main"], body' }
}

function findElementRef(snapshot: CompactPageSnapshot | undefined, target: string, kinds?: string[]) {
  if (!snapshot) return undefined
  const normalized = normalizeTarget(target)
  return snapshot.elements.find((element) => {
    if (kinds?.length && !kinds.includes(element.kind)) return false
    const haystack = normalizeTarget(
      [
        element.label,
        element.text,
        element.name,
        element.placeholder,
        element.href,
      ]
        .filter(Boolean)
        .join(' ')
    )
    return haystack.includes(normalized)
  })
}

function findFieldRef(snapshot: CompactPageSnapshot | undefined, target: string) {
  if (!snapshot) return undefined
  const normalized = normalizeTarget(target)
  const field =
    snapshot.forms.flatMap((form) => form.fields).find((field) => {
      const haystack = normalizeTarget(
        [field.label, field.name, field.placeholder, field.selector, field.type].filter(Boolean).join(' ')
      )
      return haystack.includes(normalized)
    }) ??
    snapshot.elements.find((element) => {
      if (!['input', 'textarea', 'select'].includes(element.kind)) return false
      const haystack = normalizeTarget(
        [element.label, element.name, element.placeholder, element.selector, element.type].filter(Boolean).join(' ')
      )
      return haystack.includes(normalized)
    })

  return field
}

function normalizeTarget(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

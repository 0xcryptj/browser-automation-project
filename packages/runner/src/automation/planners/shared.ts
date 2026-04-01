import { ActionPlan } from '@browser-automation/shared'
import type { CompactPageSnapshot, TaskPlan, TaskRequest } from '@browser-automation/shared'

export function buildPlannerInput(request: TaskRequest): string {
  const actionableElements = request.observation?.elements?.filter((element) => element.actionable) ?? []
  const visibleInputs =
    request.observation?.elements?.filter(
      (element) => element.kind === 'input' || element.kind === 'textarea' || element.kind === 'select'
    ) ?? []

  const lines: string[] = [
    `Mode: ${request.mode}`,
    `Task: ${request.prompt}`,
  ]

  if (request.url) {
    lines.push(`Current URL: ${request.url}`)
  }
  if (request.title) {
    lines.push(`Current title: ${request.title}`)
  }

  if (request.observation) {
    const observation = request.observation
    lines.push(`Observed page: ${observation.title} (${observation.url})`)
    if (observation.snapshot) {
      lines.push(`Compact snapshot summary: ${observation.snapshot.summary}`)
      if (observation.snapshot.visibleTextSummary) {
        lines.push(`Visible text summary: ${observation.snapshot.visibleTextSummary}`)
      }
      lines.push(`Actionable refs: ${observation.snapshot.actionableRefs.join(', ') || 'none'}`)
      lines.push(`Snapshot elements:\n${formatSnapshotElements(observation.snapshot)}`)
      if (observation.snapshot.forms.length) {
        lines.push(`Snapshot forms:\n${formatSnapshotForms(observation.snapshot)}`)
      }
    }

    if (observation.headings?.length) {
      lines.push(`Headings: ${observation.headings.join(' | ')}`)
    }

    lines.push(
      `Observation summary: ${JSON.stringify({
        headingCount: observation.headings?.length ?? 0,
        textBlockCount: observation.textBlocks?.length ?? 0,
        formCount: observation.forms?.length ?? 0,
        actionableCount: actionableElements.length,
        inputCount: visibleInputs.length,
        linkCount: observation.links?.length ?? 0,
      })}`
    )

    if (observation.textBlocks?.length) {
      lines.push(
        `Visible text blocks:\n${observation.textBlocks
          .slice(0, 12)
          .map((block, index) => `${index + 1}. ${block.text}`)
          .join('\n')}`
      )
    } else if (observation.text) {
      lines.push(`Visible text:\n${observation.text.slice(0, 2000)}`)
    }

    if (observation.forms?.length) {
      const forms = observation.forms
        .slice(0, 5)
        .map((form, index) => {
          const fields = form.fields
            .slice(0, 10)
            .map((field) => `${field.label ?? field.name ?? field.selector} [${field.type}]`)
            .join(', ')
          return `${index + 1}. ${form.selector}: ${fields}`
        })
        .join('\n')
      lines.push(`Forms:\n${forms}`)
    }

    if (observation.elements?.length) {
      const elements = observation.elements
        .filter((element) => element.visible)
        .slice(0, 25)
        .map((element, index) => {
          const label = element.label ?? element.text ?? element.ariaLabel ?? element.selector
          return `${index + 1}. ${element.kind} -> ${label} | selector=${element.selector}`
        })
        .join('\n')
      lines.push(`Elements:\n${elements}`)
    }
  }

  return lines.join('\n\n')
}

export function parsePlanFromJson(raw: string, request: TaskRequest, plannerName: string): TaskPlan {
  const json = sanitizePlannerResponse(raw)
  logPlannerRaw(plannerName, json)

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    const recovered = recoverPlannerJson(json)
    if (!recovered) {
      return failedPlan(request, `Planner returned invalid JSON`, plannerName)
    }

    try {
      parsed = JSON.parse(recovered)
    } catch {
      return failedPlan(request, `Planner returned invalid JSON`, plannerName)
    }
  }

  const actionPlan = ActionPlan.safeParse(normalizeProviderOutput(extractActionPlanShape(parsed)))
  if (!actionPlan.success) {
    return failedPlan(
      request,
      `Planner output failed validation: ${actionPlan.error.issues
        .map((issue) => `${issue.path.join('.') || 'root'} ${issue.message}`)
        .slice(0, 3)
        .join('; ')}`,
      plannerName
    )
  }

  logPlannerPlan(plannerName, actionPlan.data)

  const normalizedPlan = normalizeActionPlan(actionPlan.data, request)
  const hasApproval = normalizedPlan.steps.some((step) => step.action.requiresApproval)

  return {
    id: request.id,
    prompt: request.prompt,
    steps: normalizedPlan.steps,
    context: request.observation
      ? {
          url: request.url ?? request.observation.url,
          title: request.title ?? request.observation.title,
          snapshot: request.observation.snapshot,
          text: request.observation.text,
          headings: request.observation.headings,
          textBlocks: request.observation.textBlocks?.map((block) => block.text),
        }
      : {
          url: request.url,
          title: request.title,
        },
    status: hasApproval ? 'awaiting_approval' : 'planned',
    summary: normalizedPlan.summary,
    plannerUsed: plannerName,
    createdAt: Date.now(),
  }
}

export function failedPlan(request: TaskRequest, error: string, plannerName: string): TaskPlan {
  console.error(`[planner:${plannerName}] ${error}`)
  return {
    id: request.id,
    prompt: request.prompt,
    steps: [],
    status: 'failed',
    summary: `Planning failed: ${error}`,
    plannerUsed: plannerName,
    createdAt: Date.now(),
  }
}

function logPlannerRaw(plannerName: string, raw: string) {
  console.info(
    `[planner:${plannerName}] raw_response length=${raw.length} preview=${JSON.stringify(
      raw.slice(0, 120)
    )}`
  )
}

function normalizeActionPlan(plan: ActionPlan, request: TaskRequest): ActionPlan {
  const sanitizedPlan = sanitizeApprovalNoise(plan)

  if (!shouldUseGroundedReadPlan(request)) {
    return sanitizedPlan
  }

  const groundedPlan = buildGroundedReadPlan(request)
  return groundedPlan ? sanitizeApprovalNoise(groundedPlan) : sanitizedPlan
}

function sanitizeApprovalNoise(plan: ActionPlan): ActionPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => ({
      ...step,
      action: shouldAutoClearApproval(step.action)
        ? {
            ...step.action,
            requiresApproval: false,
            sensitivity: 'none',
            approvalReason: undefined,
          }
        : step.action,
    })),
  }
}

function shouldAutoClearApproval(action: ActionPlan['steps'][number]['action']) {
  if (!action.requiresApproval) return false

  const haystack = [action.description, action.selector, action.elementRef, action.value, action.url]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!haystack) {
    return false
  }

  const benignPatterns = [
    'search',
    'query',
    'filter',
    'sort',
    'next page',
    'previous page',
    'pagination',
    'open result',
    'open link',
    'navigate',
    'go to',
    'expand',
    'show more',
    'load more',
  ]

  const irreversiblePatterns = [
    'submit application',
    'submit order',
    'place order',
    'confirm purchase',
    'checkout',
    'pay',
    'payment',
    'buy',
    'purchase',
    'send',
    'email',
    'post review',
    'publish',
    'delete',
    'remove',
  ]

  if (irreversiblePatterns.some((pattern) => haystack.includes(pattern))) {
    return false
  }

  return benignPatterns.some((pattern) => haystack.includes(pattern))
}

function shouldUseGroundedReadPlan(request: TaskRequest) {
  if (!request.observation) return false

  const prompt = request.prompt.toLowerCase()
  const asksToUnderstandPage =
    prompt.includes('tell me what i') ||
    prompt.includes('tell me about this page') ||
    prompt.includes('tell me about the page') ||
    prompt.includes('tell me about this webpage') ||
    prompt.includes('what am i viewing') ||
    prompt.includes('what are we viewing') ||
    prompt.includes('read the page') ||
    prompt.includes('read this page') ||
    prompt.includes('summarize this page') ||
    prompt.includes('what is on this page') ||
    prompt.includes('what does this page say')

  return asksToUnderstandPage
}

function buildGroundedReadPlan(request: TaskRequest): ActionPlan | null {
  const observation = request.observation
  if (!observation) return null

  const steps: ActionPlan['steps'] = []
  const snapshot = observation.snapshot
  const heading = observation.headings?.[0]
  const headingRef =
    snapshot?.elements.find((element) => element.kind === 'text' && /^h1/i.test(element.selector ?? ''))?.ref
    ?? snapshot?.elements.find((element) => element.kind === 'text' && (element.text ?? '').trim() === (heading ?? '').trim())?.ref

  if (heading || headingRef) {
    steps.push({
      step: steps.length,
      status: 'pending',
      action: {
        type: 'extract',
        elementRef: headingRef,
        selector: headingRef ? undefined : 'h1, h2, title',
        description: 'Extract the main heading text',
        requiresApproval: false,
        sensitivity: 'none',
      },
    })
  }

  const mainRef = snapshot?.mainContentRef
  const mainSelector = snapshot?.mainContentSelector ?? 'main, article, [role="main"], body'
  steps.push({
    step: steps.length,
    status: 'pending',
    action: {
      type: 'extract',
      elementRef: mainRef,
      selector: mainSelector,
      description: 'Extract the main body content',
      requiresApproval: false,
      sensitivity: 'none',
    },
  })

  return {
    summary: 'Read and summarize the current page using the observed page context',
    steps,
  }
}

function formatSnapshotElements(snapshot: CompactPageSnapshot): string {
  return snapshot.elements
    .slice(0, 30)
    .map((element) => {
      const label = element.label ?? element.text ?? element.name ?? element.selector ?? '(unnamed)'
      const bits = [
        `${element.ref}`,
        element.kind,
        label,
        element.formRef ? `form=${element.formRef}` : '',
        element.selector ? `selector=${element.selector}` : '',
      ].filter(Boolean)
      return `- ${bits.join(' | ')}`
    })
    .join('\n')
}

function formatSnapshotForms(snapshot: CompactPageSnapshot): string {
  return snapshot.forms
    .slice(0, 8)
    .map((form) => {
      const fields = form.fields
        .slice(0, 10)
        .map((field) => `${field.ref}:${field.label ?? field.name ?? field.selector ?? field.type ?? field.kind}`)
        .join(', ')
      return `- ${form.ref} ${form.selector ?? ''} -> ${fields}`
    })
    .join('\n')
}

function logPlannerPlan(
  plannerName: string,
  plan: { summary?: string; steps: Array<{ step: number; action: { type: string; requiresApproval?: boolean; sensitivity?: string } }> }
) {
  console.info(
    `[planner:${plannerName}] parsed_plan ${JSON.stringify({
      summary: plan.summary?.slice(0, 120),
      stepCount: plan.steps.length,
      steps: plan.steps.map((step) => ({
        step: step.step,
        type: step.action.type,
        requiresApproval: Boolean(step.action.requiresApproval),
        sensitivity: step.action.sensitivity ?? 'none',
      })),
    })}`
  )
}

function sanitizePlannerResponse(raw: string) {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function recoverPlannerJson(raw: string) {
  const candidates = collectBalancedJsonObjects(raw)
  const prioritized = candidates
    .filter((candidate) => /"steps"\s*:|steps\s*:/.test(candidate))
    .sort((left, right) => right.length - left.length)

  return prioritized[0] ?? candidates.sort((left, right) => right.length - left.length)[0] ?? null
}

function collectBalancedJsonObjects(raw: string) {
  const results: string[] = []

  for (let start = 0; start < raw.length; start += 1) {
    if (raw[start] !== '{') continue

    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < raw.length; index += 1) {
      const char = raw[index]

      if (escaped) {
        escaped = false
        continue
      }

      if (char === '\\') {
        escaped = true
        continue
      }

      if (char === '"') {
        inString = !inString
        continue
      }

      if (inString) continue

      if (char === '{') depth += 1
      if (char === '}') depth -= 1

      if (depth === 0) {
        results.push(raw.slice(start, index + 1).trim())
        break
      }
    }
  }

  return results
}

function extractActionPlanShape(parsed: unknown) {
  if (!parsed || typeof parsed !== 'object') {
    return parsed
  }

  const record = parsed as Record<string, unknown>

  if (record.plan && typeof record.plan === 'object') {
    return record.plan
  }

  if (Array.isArray(record.steps)) {
    return {
      summary: typeof record.summary === 'string' ? record.summary : undefined,
      steps: record.steps,
    }
  }

  return parsed
}

function normalizeProviderOutput(value: unknown): unknown {
  if (value === null) {
    return undefined
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeProviderOutput(entry))
  }

  if (typeof value === 'object' && value) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeProviderOutput(entry)])
    )
  }

  return value
}

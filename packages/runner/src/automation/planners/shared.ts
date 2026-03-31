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
  const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  logPlannerRaw(plannerName, json)

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return failedPlan(request, `Planner returned invalid JSON`, plannerName)
  }

  const actionPlan = ActionPlan.safeParse(parsed)
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

  const hasApproval = actionPlan.data.steps.some((step) => step.action.requiresApproval)

  return {
    id: request.id,
    prompt: request.prompt,
    steps: actionPlan.data.steps,
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
    summary: actionPlan.data.summary,
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

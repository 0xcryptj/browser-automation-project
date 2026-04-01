/**
 * /assist/extract — Assist Mode endpoint.
 * Takes a page observation and returns structured ImportantInfoExtraction.
 * Requires an LLM provider (anthropic or openai); returns empty result for mock.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ImportantInfoExtraction } from '@browser-automation/shared'
import { ImportantInfoExtraction as ImportantInfoSchema, PageObservation } from '@browser-automation/shared'
import { config } from '../config.js'
import { ASSIST_EXTRACTION_PROMPT } from '../automation/planners/prompts.js'
import { getResolvedPlannerConfig } from '../settings/plannerConfigStore.js'

const RequestBody = z.object({
  observation: PageObservation,
})

export async function assistRoutes(server: FastifyInstance) {
  server.post('/assist/extract', async (request, reply) => {
    const parse = RequestBody.safeParse(request.body)
    if (!parse.success) {
      return reply.status(400).send({ error: 'Invalid request', issues: parse.error.issues })
    }

    const { observation } = parse.data
    const pageContent = buildPageContent(observation)
    const planner = await getResolvedPlannerConfig()

    if (planner.provider === 'mock' || !planner.ready) {
      // Mock extraction: parse obvious date patterns from text
      return reply.send(mockExtraction(observation))
    }

    if (planner.provider === 'anthropic' && planner.apiKey) {
      return reply.send(await extractWithAnthropic(pageContent, observation.url, planner.apiKey, planner.model))
    }

    if (planner.provider === 'openai' && planner.apiKey) {
      return reply.send(await extractWithOpenAI(pageContent, observation.url, planner.apiKey, planner.model, planner.baseUrl))
    }

    if (planner.provider === 'ollama') {
      return reply.send(await extractWithOllama(pageContent, observation.url, planner.baseUrl, planner.model))
    }

    return reply.send(mockExtraction(observation))
  })
}

function buildPageContent(obs: typeof PageObservation._type): string {
  const snapshot = obs.snapshot
  const actionable = snapshot?.elements
    .filter((element) => element.actionable)
    .slice(0, 12)
    .map((element) => `${element.ref}: ${element.label ?? element.text ?? element.selector}`)
    .join(' | ')
  const forms = snapshot?.forms
    .slice(0, 6)
    .map((form) => `${form.ref}: ${form.fields.map((field) => field.label ?? field.name ?? field.selector).slice(0, 6).join(', ')}`)
    .join(' | ')
  const lines = [
    `URL: ${obs.url}`,
    `Title: ${obs.title}`,
    obs.headings?.length ? `Headings: ${obs.headings.join(' | ')}` : '',
    snapshot?.summary ? `Snapshot: ${snapshot.summary}` : '',
    actionable ? `Actionable elements: ${actionable}` : '',
    forms ? `Forms: ${forms}` : '',
    obs.text ? `\nPage text:\n${obs.text.slice(0, 6000)}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

async function extractWithAnthropic(
  content: string,
  url: string,
  apiKey: string,
  model?: string
): Promise<ImportantInfoExtraction> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })
  const resolvedModel = config.ASSIST_MODEL ?? model ?? 'claude-opus-4-6'

  try {
    const msg = await client.messages.create({
      model: resolvedModel,
      max_tokens: 2048,
      system: ASSIST_EXTRACTION_PROMPT,
      messages: [{ role: 'user', content }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    const raw = block?.type === 'text' ? block.text : '{}'
    return parseExtraction(raw, url)
  } catch (err) {
    return errorExtraction(String(err), url)
  }
}

async function extractWithOpenAI(
  content: string,
  url: string,
  apiKey: string,
  model?: string,
  baseUrl?: string
): Promise<ImportantInfoExtraction> {
  const OpenAI = (await import('openai')).default
  const client = new OpenAI({ apiKey, baseURL: baseUrl })
  const resolvedModel = config.ASSIST_MODEL ?? model ?? 'gpt-4o'

  try {
    const res = await client.chat.completions.create({
      model: resolvedModel,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ASSIST_EXTRACTION_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: 2048,
    })
    const raw = res.choices[0]?.message?.content ?? '{}'
    return parseExtraction(raw, url)
  } catch (err) {
    return errorExtraction(String(err), url)
  }
}

async function extractWithOllama(
  content: string,
  url: string,
  baseUrl?: string,
  model?: string
): Promise<ImportantInfoExtraction> {
  try {
    const response = await fetch(`${(baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ASSIST_MODEL ?? model ?? 'llama3.1',
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: ASSIST_EXTRACTION_PROMPT },
          { role: 'user', content },
        ],
      }),
    })

    if (!response.ok) {
      return errorExtraction(`Ollama returned ${response.status} ${response.statusText}`, url)
    }

    const body = (await response.json()) as { message?: { content?: string } }
    return parseExtraction(body.message?.content ?? '{}', url)
  } catch (err) {
    return errorExtraction(String(err), url)
  }
}

function parseExtraction(raw: string, url: string): ImportantInfoExtraction {
  try {
    const parsed = JSON.parse(raw)
    const result = ImportantInfoSchema.safeParse({ ...parsed, rawUrl: url, extractedAt: Date.now() })
    if (result.success) return result.data
    return { ...emptyExtraction(), summary: 'Extraction parse error', rawUrl: url }
  } catch {
    return { ...emptyExtraction(), summary: 'Invalid JSON from provider', rawUrl: url }
  }
}

function mockExtraction(obs: typeof PageObservation._type): ImportantInfoExtraction {
  // Simple regex-based date extraction for mock mode
  const dateRe = /(\b\w+ \d{1,2},?\s*\d{4}\b|\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b)/g
  const dates = [...(obs.text ?? '').matchAll(dateRe)].map((m) => m[0]).slice(0, 5)
  const text = `${obs.title}\n${obs.text ?? ''}`.toLowerCase()
  const jobApplicationSignals = [
    'apply now',
    'job description',
    'resume',
    'cover letter',
    'salary',
    'years of experience',
  ].filter((signal) => text.includes(signal))
  const isJobApplicationPage = jobApplicationSignals.length >= 2
  const actionables = obs.snapshot?.elements
    .filter((element) => element.actionable)
    .map((element) => element.label ?? element.text ?? element.selector)
    .filter((value): value is string => Boolean(value))
    .slice(0, 8) ?? []
  const formHints = obs.snapshot?.forms
    .flatMap((form) => form.fields.map((field) => field.label ?? field.name ?? field.selector))
    .filter((value): value is string => Boolean(value))
    .slice(0, 8) ?? []
  const callsToAction = actionables.filter((label) =>
    /\b(apply|continue|next|submit|sign in|log in|book|start|get started|contact)\b/i.test(label)
  )
  const warnings = [
    ...(dates.length > 0 ? ['This page contains time-sensitive dates.'] : []),
    ...(isJobApplicationPage ? ['This looks like a job application flow, so double-check details before submitting anything.'] : []),
  ]
  const nextActions = [
    ...(callsToAction.length > 0 ? [`Review the visible action before clicking: ${callsToAction[0]}`] : []),
    ...(formHints.length > 0 ? [`Prepare the visible form fields: ${formHints.slice(0, 3).join(', ')}`] : []),
    ...(dates[0] ? [`Note the next important date on the page: ${dates[0]}`] : []),
  ]
  const requiredMaterials = [
    ...new Set(
      ['resume', 'cover letter', 'portfolio', 'linkedin', 'github']
        .filter((signal) => text.includes(signal))
        .map((signal) => signal.charAt(0).toUpperCase() + signal.slice(1))
    ),
  ]
  return {
    ...emptyExtraction(),
    pageCategory: isJobApplicationPage ? 'job_application' : dates.length > 0 ? 'deadline' : 'general',
    isJobApplicationPage,
    jobApplicationSignals,
    deadlines: dates.map((d) => ({ label: 'Date found', rawText: d })),
    warnings,
    nextActions,
    requiredMaterials,
    callsToAction,
    summary:
      isJobApplicationPage
        ? `This page appears to be a job application flow. Review the requirements, note any deadlines, and prepare the visible materials before taking the next action.`
        : dates.length > 0
          ? `This page includes actionable timing information. Review the listed dates and the visible calls to action before moving forward.`
          : `This page appears informational. Review the summary content and any visible actions before proceeding.`,
    rawUrl: obs.url,
    extractedAt: Date.now(),
  }
}

function emptyExtraction(): ImportantInfoExtraction {
  return {
    pageCategory: 'general',
    isJobApplicationPage: false,
    jobApplicationSignals: [],
    deadlines: [],
    dueDates: [],
    applicationDates: [],
    eventTimes: [],
    warnings: [],
    requiredMaterials: [],
    nextActions: [],
    missingRequirements: [],
    callsToAction: [],
    summary: '',
    extractedAt: Date.now(),
  }
}

function errorExtraction(error: string, url: string): ImportantInfoExtraction {
  return { ...emptyExtraction(), summary: `Extraction failed: ${error}`, rawUrl: url, extractedAt: Date.now() }
}

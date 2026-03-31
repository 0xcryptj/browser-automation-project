import { z } from 'zod'

export const ObservationCaptureMode = z.enum(['full', 'compact'])
export type ObservationCaptureMode = z.infer<typeof ObservationCaptureMode>

export const ObservationOptions = z.object({
  mode: ObservationCaptureMode.default('compact'),
  visibleOnly: z.boolean().default(true),
  interactiveOnly: z.boolean().default(false),
  maxElements: z.number().int().min(1).max(200).default(60),
  maxTextBlocks: z.number().int().min(1).max(100).default(20),
})
export type ObservationOptions = z.infer<typeof ObservationOptions>

export const ObservedElementKind = z.enum([
  'button',
  'link',
  'input',
  'textarea',
  'select',
  'label',
  'text',
  'actionable',
  'main',
  'form',
])
export type ObservedElementKind = z.infer<typeof ObservedElementKind>

export const ObservedElement = z.object({
  ref: z.string(),
  kind: ObservedElementKind,
  selector: z.string(),
  tag: z.string(),
  text: z.string().optional(),
  label: z.string().optional(),
  role: z.string().optional(),
  type: z.string().optional(),
  placeholder: z.string().optional(),
  value: z.string().optional(),
  href: z.string().optional(),
  ariaLabel: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  options: z.array(z.string()).optional(),
  region: z.enum(['main', 'aside', 'header', 'footer', 'body']).optional(),
  formRef: z.string().optional(),
  visible: z.boolean(),
  interactive: z.boolean(),
  actionable: z.boolean(),
  required: z.boolean().optional(),
  disabled: z.boolean().optional(),
  checked: z.boolean().optional(),
})
export type ObservedElement = z.infer<typeof ObservedElement>

export const ObservedTextBlock = z.object({
  ref: z.string(),
  selector: z.string(),
  text: z.string(),
  region: z.enum(['main', 'aside', 'header', 'footer', 'body']).optional(),
})
export type ObservedTextBlock = z.infer<typeof ObservedTextBlock>

export const ObservedFormField = z.object({
  ref: z.string(),
  selector: z.string(),
  name: z.string().optional(),
  id: z.string().optional(),
  type: z.string(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  value: z.string().optional(),
  options: z.array(z.string()).optional(),
})
export type ObservedFormField = z.infer<typeof ObservedFormField>

export const ObservedForm = z.object({
  ref: z.string(),
  selector: z.string(),
  id: z.string().optional(),
  action: z.string().optional(),
  method: z.string().optional(),
  fields: z.array(ObservedFormField),
})
export type ObservedForm = z.infer<typeof ObservedForm>

export const ObservedLink = z.object({
  ref: z.string(),
  text: z.string(),
  href: z.string(),
  selector: z.string(),
  external: z.boolean().default(false),
})
export type ObservedLink = z.infer<typeof ObservedLink>

export const SnapshotElement = z.object({
  ref: z.string(),
  kind: ObservedElementKind,
  selector: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
  role: z.string().optional(),
  type: z.string().optional(),
  placeholder: z.string().optional(),
  name: z.string().optional(),
  href: z.string().optional(),
  options: z.array(z.string()).optional(),
  formRef: z.string().optional(),
  region: z.enum(['main', 'aside', 'header', 'footer', 'body']).optional(),
  actionable: z.boolean().default(false),
  required: z.boolean().optional(),
  disabled: z.boolean().optional(),
})
export type SnapshotElement = z.infer<typeof SnapshotElement>

export const SnapshotForm = z.object({
  ref: z.string(),
  selector: z.string().optional(),
  fields: z.array(SnapshotElement),
})
export type SnapshotForm = z.infer<typeof SnapshotForm>

export const CompactPageSnapshot = z.object({
  mode: ObservationCaptureMode.default('compact'),
  visibleOnly: z.boolean().default(true),
  interactiveOnly: z.boolean().default(false),
  summary: z.string(),
  visibleTextSummary: z.string().optional(),
  mainContentSelector: z.string().optional(),
  mainContentRef: z.string().optional(),
  actionableRefs: z.array(z.string()).default([]),
  elements: z.array(SnapshotElement),
  forms: z.array(SnapshotForm).default([]),
})
export type CompactPageSnapshot = z.infer<typeof CompactPageSnapshot>

export const PageObservation = z.object({
  url: z.string(),
  title: z.string(),
  text: z.string().optional(),
  screenshot: z.string().optional(),
  options: ObservationOptions.optional(),
  elements: z.array(ObservedElement).optional(),
  forms: z.array(ObservedForm).optional(),
  links: z.array(ObservedLink).optional(),
  headings: z.array(z.string()).optional(),
  textBlocks: z.array(ObservedTextBlock).optional(),
  snapshot: CompactPageSnapshot.optional(),
  timestamp: z.number(),
})
export type PageObservation = z.infer<typeof PageObservation>

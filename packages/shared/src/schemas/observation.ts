import { z } from 'zod'

export const ObservedElement = z.object({
  selector: z.string(),
  tag: z.string(),
  text: z.string().optional(),
  role: z.string().optional(),
  type: z.string().optional(),
  placeholder: z.string().optional(),
  href: z.string().optional(),
  visible: z.boolean(),
  interactive: z.boolean(),
})

export type ObservedElement = z.infer<typeof ObservedElement>

export const PageObservation = z.object({
  url: z.string(),
  title: z.string(),
  text: z.string().optional(),       // visible text content (trimmed)
  screenshot: z.string().optional(), // base64 PNG
  elements: z.array(ObservedElement).optional(),
  timestamp: z.number(),
})

export type PageObservation = z.infer<typeof PageObservation>

import type { Page } from 'playwright'
import type { PageObservation } from '@browser-automation/shared'

export async function observe(page: Page, captureScreenshot = false): Promise<PageObservation> {
  const [url, title, text, elements] = await Promise.all([
    Promise.resolve(page.url()),
    page.title(),
    page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? ''),
    page.evaluate(() => {
      const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', '[role="button"]']
      const nodes = document.querySelectorAll(interactiveTags.join(','))
      return Array.from(nodes)
        .slice(0, 50)
        .map((el) => {
          const e = el as HTMLElement
          const tag = e.tagName.toLowerCase()
          const id = e.id ? `#${e.id}` : ''
          const cls = e.className
            ? '.' +
              String(e.className)
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .join('.')
            : ''
          const selector = id || (cls ? `${tag}${cls}` : tag)
          const rect = e.getBoundingClientRect()
          return {
            selector,
            tag,
            text: e.innerText?.trim().slice(0, 80) ?? '',
            role: e.getAttribute('role') ?? undefined,
            type: (e as HTMLInputElement).type ?? undefined,
            placeholder: (e as HTMLInputElement).placeholder ?? undefined,
            href: (e as HTMLAnchorElement).href ?? undefined,
            visible: rect.width > 0 && rect.height > 0,
            interactive: true,
          }
        })
    }),
  ])

  let screenshot: string | undefined
  if (captureScreenshot) {
    const buf = await page.screenshot({ type: 'png' })
    screenshot = buf.toString('base64')
  }

  return {
    url,
    title,
    text,
    screenshot,
    elements,
    timestamp: Date.now(),
  }
}

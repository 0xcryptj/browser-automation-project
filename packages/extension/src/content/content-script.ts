/// <reference types="chrome" />

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'COLLECT_CONTEXT') {
    const elements = Array.from(
      document.querySelectorAll('a, button, input, select, textarea, [role="button"]')
    )
      .slice(0, 50)
      .map((el) => {
        const e = el as HTMLElement
        const tag = e.tagName.toLowerCase()
        const id = e.id ? `#${e.id}` : ''
        const cls = e.className
          ? '.' + String(e.className).trim().split(/\s+/).slice(0, 2).join('.')
          : ''
        const rect = e.getBoundingClientRect()
        return {
          selector: id || (cls ? `${tag}${cls}` : tag),
          tag,
          text: e.innerText?.trim().slice(0, 80) ?? '',
          role: e.getAttribute('role') ?? undefined,
          visible: rect.width > 0 && rect.height > 0,
          interactive: true,
        }
      })

    sendResponse({
      url: location.href,
      title: document.title,
      text: document.body?.innerText?.slice(0, 2000) ?? '',
      elements,
      timestamp: Date.now(),
    })
    return true
  }
})

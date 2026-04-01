import type { ObservationOptions, ObservedElementKind } from './schemas/observation.ts'

const DEFAULT_OPTIONS: ObservationOptions = {
  mode: 'compact',
  visibleOnly: true,
  interactiveOnly: false,
  maxElements: 60,
  maxTextBlocks: 20,
}

export function buildPageObservationScript(options?: Partial<ObservationOptions>) {
  void options

  return (input: ObservationOptions) => {
    const opts = {
      mode: input.mode ?? 'compact',
      visibleOnly: input.visibleOnly ?? true,
      interactiveOnly: input.interactiveOnly ?? false,
      maxElements: input.maxElements ?? 60,
      maxTextBlocks: input.maxTextBlocks ?? 20,
    }
    const counters = { element: 0, form: 0, text: 0, link: 0 }

    const nextRef = (prefix: string) => {
      if (prefix === 'f') return `f${++counters.form}`
      if (prefix === 't') return `t${++counters.text}`
      if (prefix === 'l') return `l${++counters.link}`
      return `e${++counters.element}`
    }

    const markRef = (el: Element, ref: string) => {
      try {
        ;(el as HTMLElement).setAttribute('data-browser-automation-ref', ref)
      } catch {
        // Ignore pages that disallow DOM mutation on certain nodes.
      }
    }

    const isVisible = (el: Element) => {
      const html = el as HTMLElement
      const rect = html.getBoundingClientRect()
      const style = window.getComputedStyle(html)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }

    const textOf = (el: Element, max = 180) =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

    const buildFallbackSelector = (el: Element) => {
      const parts: string[] = []
      let current: Element | null = el
      let depth = 0
      while (current && depth < 3) {
        const tag = current.tagName.toLowerCase()
        const parent: Element | null = current.parentElement
        if (!parent) {
          parts.unshift(tag)
          break
        }
        const siblings = Array.from(parent.children).filter((child: Element) => child.tagName === current!.tagName)
        const index = siblings.indexOf(current) + 1
        parts.unshift(`${tag}:nth-of-type(${Math.max(index, 1)})`)
        current = parent
        depth += 1
      }
      return parts.join(' > ')
    }

    const selectorFor = (el: Element) => {
      const html = el as HTMLElement
      const input = el as HTMLInputElement
      const tag = el.tagName.toLowerCase()
      const dataTestId = html.getAttribute('data-testid')
      const ariaLabel = html.getAttribute('aria-label')
      if (html.id) return `#${html.id}`
      if (input.name) return `${tag}[name="${input.name}"]`
      if (dataTestId) return `[data-testid="${dataTestId}"]`
      if (ariaLabel) return `${tag}[aria-label="${ariaLabel}"]`
      if (tag === 'a' && (el as HTMLAnchorElement).href) {
        return `a[href="${(el as HTMLAnchorElement).href.slice(0, 160)}"]`
      }
      return buildFallbackSelector(el)
    }

    const labelFor = (el: Element) => {
      const input = el as HTMLInputElement
      const html = el as HTMLElement
      if (input.id) {
        const explicit = document.querySelector(`label[for="${input.id}"]`)
        if (explicit) return textOf(explicit)
      }
      const wrapped = el.closest('label')
      if (wrapped) return textOf(wrapped)
      return html.getAttribute('aria-label') ?? input.placeholder ?? input.name ?? undefined
    }

    const mainRoot =
      Array.from(document.querySelectorAll('main, article, [role="main"], #main, .main')).find((node) =>
        isVisible(node)
      ) ?? null

    const regionFor = (el: Element): 'main' | 'aside' | 'header' | 'footer' | 'body' => {
      if (mainRoot && mainRoot.contains(el)) return 'main'
      const container = el.closest('aside, header, footer')
      if (!container) return 'body'
      const tag = container.tagName.toLowerCase()
      if (tag === 'aside') return 'aside'
      if (tag === 'header') return 'header'
      if (tag === 'footer') return 'footer'
      return 'body'
    }

    const classify = (el: Element): ObservedElementKind => {
      const tag = el.tagName.toLowerCase()
      if (tag === 'button') return 'button'
      if (tag === 'a') return 'link'
      if (tag === 'textarea') return 'textarea'
      if (tag === 'select') return 'select'
      if (tag === 'input') return 'input'
      if (tag === 'label') return 'label'
      if (tag === 'form') return 'form'
      if (tag === 'main' || tag === 'article' || el === mainRoot) return 'main'
      if (['h1', 'h2', 'h3', 'h4', 'p', 'li', 'blockquote'].includes(tag)) return 'text'
      return 'actionable'
    }

    const isActionable = (el: Element) => {
      const html = el as HTMLElement
      const tag = el.tagName.toLowerCase()
      const role = html.getAttribute('role')
      return (
        ['a', 'button', 'input', 'select', 'textarea'].includes(tag) ||
        role === 'button' ||
        role === 'link' ||
        role === 'menuitem' ||
        typeof html.onclick === 'function' ||
        html.tabIndex >= 0
      )
    }

    const forms = Array.from(document.querySelectorAll('form'))
      .filter((form) => !opts.visibleOnly || isVisible(form))
      .slice(0, 10)
      .map((form, index) => {
        const formEl = form as HTMLFormElement
        const ref = nextRef('f')
        markRef(form, ref)
        const selector = formEl.id ? `#${formEl.id}` : `form:nth-of-type(${index + 1})`
        const fields = Array.from(form.querySelectorAll('input:not([type="hidden"]), select, textarea'))
          .filter((field) => !opts.visibleOnly || isVisible(field))
          .slice(0, 20)
          .map((field) => {
            const fieldRef = nextRef('e')
            markRef(field, fieldRef)
            const input = field as HTMLInputElement
            const tag = field.tagName.toLowerCase()
            return {
              ref: fieldRef,
              selector: selectorFor(field),
              name: input.name || undefined,
              id: input.id || undefined,
              type: input.type || tag,
              label: labelFor(field),
              placeholder: input.placeholder || undefined,
              required: input.required || false,
              value: input.value?.slice(0, 120) || undefined,
              options:
                tag === 'select'
                  ? Array.from((field as HTMLSelectElement).options)
                      .map((option) => option.text.trim())
                      .filter(Boolean)
                      .slice(0, 12)
                  : undefined,
            }
          })

        return {
          ref,
          selector,
          id: formEl.id || undefined,
          action: formEl.action || undefined,
          method: formEl.method || undefined,
          fields,
        }
      })

    const formFieldMap = new Map(forms.flatMap((form) => form.fields.map((field) => [field.selector, form.ref] as const)))

    const rawElements = [
      ...(mainRoot && isVisible(mainRoot) ? [mainRoot] : []),
      ...document.querySelectorAll(
        'main, article, [role="main"], h1, h2, h3, h4, input:not([type="hidden"]), textarea, select, button, a[href], label, form, [role="button"], [role="link"], [role="menuitem"], [onclick], [tabindex]'
      ),
    ]

    const seenSelectors = new Set<string>()
    const elements = rawElements
      .filter((el) => (!opts.visibleOnly || isVisible(el)) && (!opts.interactiveOnly || isActionable(el)))
      .map((el) => {
        const html = el as HTMLElement
        const input = el as HTMLInputElement
        const selector = selectorFor(el)
        if (seenSelectors.has(selector)) return null
        seenSelectors.add(selector)
        const ref = nextRef('e')
        markRef(el, ref)
        const tag = el.tagName.toLowerCase()
        const actionable = isActionable(el)
        return {
          ref,
          kind: classify(el),
          selector,
          tag,
          text: textOf(el) || undefined,
          label: labelFor(el),
          role: html.getAttribute('role') ?? undefined,
          type: input.type ?? undefined,
          placeholder: input.placeholder || undefined,
          value: input.value?.slice(0, 120) || undefined,
          href: tag === 'a' ? (el as HTMLAnchorElement).href || undefined : undefined,
          ariaLabel: html.getAttribute('aria-label') ?? undefined,
          name: input.name || undefined,
          id: html.id || undefined,
          options:
            tag === 'select'
              ? Array.from((el as HTMLSelectElement).options)
                  .map((option) => option.text.trim())
                  .filter(Boolean)
                  .slice(0, 12)
              : undefined,
          region: regionFor(el),
          formRef: formFieldMap.get(selector),
          visible: !opts.visibleOnly || isVisible(el),
          interactive: actionable || ['label', 'input', 'select', 'textarea', 'form'].includes(tag),
          actionable,
          required: input.required || undefined,
          disabled: input.disabled || undefined,
          checked: typeof input.checked === 'boolean' ? input.checked : undefined,
        }
      })
      .filter((element): element is NonNullable<typeof element> => Boolean(element))
      .slice(0, opts.maxElements)

    const links = elements
      .filter((element) => element.kind === 'link' && element.href)
      .slice(0, 30)
      .map((element) => ({
        ref: nextRef('l'),
        text: element.text ?? '',
        href: element.href!,
        selector: element.selector,
        external: (() => {
          try {
            return new URL(element.href!).origin !== location.origin
          } catch {
            return false
          }
        })(),
      }))

    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .filter((heading) => !opts.visibleOnly || isVisible(heading))
      .map((heading) => textOf(heading))
      .filter(Boolean)
      .slice(0, 12)

    const textBlocks = Array.from(
      document.querySelectorAll('main p, main li, article p, article li, p, li, h1, h2, h3, h4, blockquote')
    )
      .filter((block) => !opts.visibleOnly || isVisible(block))
      .map((block) => ({
        ref: (() => {
          const ref = nextRef('t')
          markRef(block, ref)
          return ref
        })(),
        selector: selectorFor(block),
        text: textOf(block, 220),
        region: regionFor(block),
      }))
      .filter((block) => block.text.length >= 24)
      .slice(0, opts.maxTextBlocks)

    const bodyText = document.body?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 4000) ?? ''
    const visibleTextSummary = textBlocks.slice(0, 5).map((block) => block.text).join(' ').slice(0, 700)
    const actionableRefs = elements.filter((element) => element.actionable).map((element) => element.ref)
    const snapshotElements = elements.map((element) => ({
      ref: element.ref,
      kind: element.kind,
      selector: element.selector,
      label: element.label,
      text: element.text,
      role: element.role,
      type: element.type,
      placeholder: element.placeholder,
      name: element.name,
      href: element.href,
      options: element.options,
      formRef: element.formRef,
      region: element.region,
      actionable: element.actionable,
      required: element.required,
      disabled: element.disabled,
    }))
    const snapshotForms = forms.map((form) => ({
      ref: form.ref,
      selector: form.selector,
      fields: form.fields.map((field) => {
        const fieldKind: ObservedElementKind =
          field.type === 'textarea'
            ? 'textarea'
            : field.type === 'select-one' || field.type === 'select'
              ? 'select'
              : 'input'

        return {
          ref: field.ref,
          kind: fieldKind,
          selector: field.selector,
          label: field.label,
          type: field.type,
          placeholder: field.placeholder,
          name: field.name,
          formRef: form.ref,
          actionable: true,
          required: field.required,
        }
      }),
    }))

    return {
      url: location.href,
      title: document.title,
      text: bodyText,
      options: opts,
      elements,
      forms,
      links,
      headings,
      textBlocks,
      snapshot: {
        mode: opts.mode,
        visibleOnly: opts.visibleOnly,
        interactiveOnly: opts.interactiveOnly,
        summary: `${document.title || 'Untitled page'} with ${snapshotElements.length} visible elements, ${forms.length} forms, ${textBlocks.length} text blocks`,
        visibleTextSummary,
        mainContentSelector: mainRoot ? selectorFor(mainRoot) : undefined,
        mainContentRef: mainRoot ? elements.find((element) => element.selector === selectorFor(mainRoot))?.ref : undefined,
        actionableRefs,
        elements: snapshotElements,
        forms: snapshotForms,
      },
      timestamp: Date.now(),
    }
  }
}

export function getDefaultObservationOptions(mode: 'task' | 'observe' = 'task'): ObservationOptions {
  return mode === 'observe'
    ? { ...resolvedDefaults(), mode: 'compact', interactiveOnly: false, maxElements: 80, maxTextBlocks: 25 }
    : { ...resolvedDefaults(), mode: 'compact', interactiveOnly: false, maxElements: 50, maxTextBlocks: 12 }
}

function resolvedDefaults(): ObservationOptions {
  return { ...DEFAULT_OPTIONS }
}

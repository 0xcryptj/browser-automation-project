/// <reference types="chrome" />
import { buildPageObservationScript, getDefaultObservationOptions } from '@browser-automation/shared'
import type { ObservationOptions } from '@browser-automation/shared'

function collectContext(options?: Partial<ObservationOptions>) {
  const resolvedOptions = { ...getDefaultObservationOptions('task'), ...options }
  return buildPageObservationScript(resolvedOptions)(resolvedOptions)
}

type OverlayPayload = {
  taskId?: string
  actionType?: string
  description?: string
  selector?: string
  elementRef?: string
  targetLabel?: string
  status?: 'running' | 'awaiting_approval' | 'info'
}

const OVERLAY_HOST_ID = 'browser-automation-overlay-host'
let activeOverlayPayload: OverlayPayload | null = null
let overlayFrame: number | null = null
let overlayCleanupBound = false

function getOverlayRoot() {
  let host = document.getElementById(OVERLAY_HOST_ID) as HTMLDivElement | null
  if (!host) {
    host = document.createElement('div')
    host.id = OVERLAY_HOST_ID
    host.style.all = 'initial'
    host.style.position = 'fixed'
    host.style.inset = '0'
    host.style.pointerEvents = 'none'
    host.style.zIndex = '2147483647'
    document.documentElement.appendChild(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .frame {
          position: fixed;
          inset: 4px;
          border-radius: 18px;
          border: 3px solid rgba(96, 165, 250, 0.82);
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.24),
            0 0 0 1px rgba(59,130,246,0.14),
            0 0 26px rgba(59,130,246,0.28),
            0 0 80px rgba(59,130,246,0.14);
          background: transparent;
          animation: frame-breathe 1.5s ease-in-out infinite;
        }
        .frame.approval {
          border-color: rgba(168, 85, 247, 0.84);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.22),
            0 0 0 1px rgba(168,85,247,0.14),
            0 0 30px rgba(168,85,247,0.30),
            0 0 80px rgba(168,85,247,0.12);
        }
        .frame.hidden { opacity: 0; }
        .frame-bar {
          position: fixed;
          left: 50%;
          top: 8px;
          transform: translateX(-50%);
          width: min(420px, calc(100vw - 28px));
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(96,165,250,0.22), rgba(96,165,250,0.95), rgba(96,165,250,0.22));
          box-shadow: 0 0 24px rgba(59,130,246,0.40);
          animation: bar-pulse 1.2s ease-in-out infinite;
        }
        .frame-bar.approval {
          background: linear-gradient(90deg, rgba(168,85,247,0.22), rgba(168,85,247,0.95), rgba(168,85,247,0.22));
          box-shadow: 0 0 24px rgba(168,85,247,0.40);
        }
        .frame-bar.hidden { opacity: 0; }
        .ring {
          position: fixed;
          border-radius: 16px;
          border: 3px solid rgba(96, 165, 250, 0.95);
          box-shadow: 0 0 0 1px rgba(191, 219, 254, 0.30), 0 0 32px rgba(59, 130, 246, 0.42);
          background: transparent;
          transition: transform 120ms ease, opacity 120ms ease, width 120ms ease, height 120ms ease;
          animation: pulse-ring 1.1s ease-in-out infinite;
        }
        .ring.approval {
          border-color: rgba(168, 85, 247, 0.95);
          box-shadow: 0 0 0 1px rgba(216, 180, 254, 0.24), 0 0 32px rgba(168, 85, 247, 0.42);
        }
        .ring.hidden { opacity: 0; transform: scale(0.98); }
        .badge {
          position: fixed;
          min-width: 280px;
          max-width: min(520px, calc(100vw - 24px));
          border-radius: 18px;
          padding: 12px 13px;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.92));
          border: 1px solid rgba(96, 165, 250, 0.32);
          box-shadow: 0 18px 48px rgba(2, 6, 23, 0.38);
          color: #dbeafe;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        @media (prefers-color-scheme: light) {
          .badge {
            background: linear-gradient(180deg, rgba(248, 250, 255, 0.97), rgba(240, 245, 255, 0.94));
            border-color: rgba(96, 165, 250, 0.40);
            box-shadow: 0 18px 48px rgba(0, 0, 50, 0.14);
            color: #1e3a5f;
          }
          .badge.approval {
            border-color: rgba(168, 85, 247, 0.42);
            color: #4a1272;
          }
          .eyebrow { color: #2563eb; }
          .badge.approval .eyebrow { color: #7c3aed; }
          .subtitle { color: #475569; }
          .badge.approval .subtitle { color: #6d28d9; }
          .stop {
            background: linear-gradient(180deg, rgba(254, 226, 226, 0.90), rgba(254, 202, 202, 0.80));
            border-color: rgba(239, 68, 68, 0.34);
            color: #991b1b;
          }
        }
        .badge.approval {
          border-color: rgba(168, 85, 247, 0.34);
          color: #f3e8ff;
        }
        .badge-row {
          display: flex;
          align-items: stretch;
          justify-content: space-between;
          gap: 10px;
        }
        .badge-copy {
          min-width: 0;
          flex: 1;
        }
        .eyebrow {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          color: #93c5fd;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .badge.approval .eyebrow { color: #d8b4fe; }
        .title {
          font-size: 13px;
          line-height: 1.4;
          font-weight: 600;
          margin-bottom: 2px;
        }
        .subtitle {
          font-size: 11px;
          line-height: 1.4;
          color: #94a3b8;
        }
        .badge.approval .subtitle { color: #d8b4fe; }
        .stop {
          pointer-events: auto;
          border: 1px solid rgba(248,113,113,0.30);
          background: linear-gradient(180deg, rgba(127,29,29,0.34), rgba(127,29,29,0.22));
          color: #ffe4e6;
          border-radius: 14px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          flex-shrink: 0;
          min-height: 36px;
          align-self: center;
          box-shadow: 0 10px 24px rgba(127,29,29,0.22);
        }
        .cursor {
          position: fixed;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), rgba(96,165,250,0.95) 48%, rgba(37,99,235,0.92));
          box-shadow: 0 0 0 8px rgba(96,165,250,0.12), 0 12px 24px rgba(37,99,235,0.24);
          transition:
            left 260ms cubic-bezier(0.22, 1, 0.36, 1),
            top 260ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 140ms ease,
            transform 140ms ease;
          transform: translate(-50%, -50%);
        }
        .cursor::after {
          content: '';
          position: absolute;
          inset: -10px;
          border-radius: 50%;
          border: 1px solid rgba(147,197,253,0.36);
          animation: cursor-ping 1.2s ease-out infinite;
        }
        .cursor.approval {
          background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.94), rgba(192,132,252,0.95) 48%, rgba(126,34,206,0.92));
          box-shadow: 0 0 0 8px rgba(168,85,247,0.12), 0 12px 24px rgba(126,34,206,0.22);
        }
        .cursor.hidden {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.86);
        }
        @keyframes pulse-ring {
          0%, 100% { transform: scale(0.99); opacity: 0.96; }
          50% { transform: scale(1.02); opacity: 0.72; }
        }
        @keyframes frame-breathe {
          0%, 100% { opacity: 0.62; }
          50% { opacity: 1; }
        }
        @keyframes bar-pulse {
          0%, 100% { opacity: 0.75; transform: translateX(-50%) scaleX(0.98); }
          50% { opacity: 1; transform: translateX(-50%) scaleX(1.01); }
        }
        @keyframes cursor-ping {
          0% { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(1.55); opacity: 0; }
        }
      </style>
      <div class="frame hidden"></div>
      <div class="frame-bar hidden"></div>
      <div class="ring hidden"></div>
      <div class="cursor hidden"></div>
    <div class="badge" hidden>
        <div class="badge-row">
          <div class="badge-copy">
            <div class="eyebrow">Browser Assistant</div>
            <div class="title"></div>
            <div class="subtitle"></div>
          </div>
          <button class="stop" hidden>Stop Task</button>
        </div>
      </div>
    `
  }

  return {
    host,
    shadow: host.shadowRoot!,
    frame: host.shadowRoot!.querySelector('.frame') as HTMLDivElement,
    frameBar: host.shadowRoot!.querySelector('.frame-bar') as HTMLDivElement,
    ring: host.shadowRoot!.querySelector('.ring') as HTMLDivElement,
    cursor: host.shadowRoot!.querySelector('.cursor') as HTMLDivElement,
    badge: host.shadowRoot!.querySelector('.badge') as HTMLDivElement,
    stop: host.shadowRoot!.querySelector('.stop') as HTMLButtonElement,
    title: host.shadowRoot!.querySelector('.title') as HTMLDivElement,
    subtitle: host.shadowRoot!.querySelector('.subtitle') as HTMLDivElement,
  }
}

function resolveOverlayTarget(payload: OverlayPayload) {
  if (payload.elementRef) {
    const byRef = document.querySelector(`[data-browser-automation-ref="${CSS.escape(payload.elementRef)}"]`)
    if (byRef instanceof HTMLElement) return byRef
  }

  if (payload.selector) {
    const candidates = payload.selector
      .split(',')
      .map((candidate) => candidate.trim())
      .filter(Boolean)

    for (const candidate of candidates) {
      try {
        const found = document.querySelector(candidate)
        if (found instanceof HTMLElement) return found
      } catch {
        // Ignore bad selectors coming from the planner.
      }
    }
  }

  return null
}

function handleOverlayKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    clearOverlay()
  }
}

function bindOverlayCleanup() {
  if (overlayCleanupBound) return
  overlayCleanupBound = true
  window.addEventListener('scroll', scheduleOverlayRender, true)
  window.addEventListener('resize', scheduleOverlayRender)
  window.addEventListener('keydown', handleOverlayKeydown, { capture: true })

  // Re-render overlay on SPA navigation so the ring/cursor targets the
  // correct element in the new DOM (or gracefully falls back to centred badge).
  const handleNavigation = () => {
    if (activeOverlayPayload) scheduleOverlayRender()
  }
  window.addEventListener('popstate', handleNavigation)
  window.addEventListener('hashchange', handleNavigation)
}

function scheduleOverlayRender() {
  if (!activeOverlayPayload) return
  const payload = activeOverlayPayload
  if (overlayFrame !== null) cancelAnimationFrame(overlayFrame)
  overlayFrame = requestAnimationFrame(() => {
    overlayFrame = null
    renderOverlay(payload)
  })
}

function showOverlay(payload: OverlayPayload) {
  activeOverlayPayload = payload
  bindOverlayCleanup()
  renderOverlay(payload)
}

function clearOverlay() {
  activeOverlayPayload = null
  if (overlayFrame !== null) {
    cancelAnimationFrame(overlayFrame)
    overlayFrame = null
  }

  const { frame, frameBar, ring, cursor, badge } = getOverlayRoot()
  frame.classList.add('hidden')
  frameBar.classList.add('hidden')
  ring.classList.add('hidden')
  cursor.classList.add('hidden')
  badge.hidden = true
}

function renderOverlay(payload: OverlayPayload) {
  const { frame, frameBar, ring, cursor, badge, stop, title, subtitle } = getOverlayRoot()
  const target = resolveOverlayTarget(payload)
  const approval = payload.status === 'awaiting_approval'

  frame.classList.toggle('approval', approval)
  frameBar.classList.toggle('approval', approval)
  ring.classList.toggle('approval', approval)
  cursor.classList.toggle('approval', approval)
  badge.classList.toggle('approval', approval)
  frame.classList.remove('hidden')
  frameBar.classList.remove('hidden')

  title.textContent = payload.description ?? describeAction(payload.actionType)
  subtitle.textContent = payload.targetLabel
    ? `Target: ${payload.targetLabel} - avoid interacting while the operator is working`
    : target
      ? 'Target located on the current page - avoid interacting while the operator is working'
      : 'Working from the current page context - avoid interacting while the operator is working'
  stop.hidden = !payload.taskId
  stop.onclick = () => {
    if (!payload.taskId) return
    chrome.runtime.sendMessage({ type: 'OVERLAY_CANCEL_TASK', payload: { taskId: payload.taskId } }, () => {
      void chrome.runtime.lastError
    })
  }

  if (target) {
    const rect = target.getBoundingClientRect()
    const padding = 8
    const cursorX = rect.left + Math.max(rect.width / 2, 14)
    const cursorY = rect.top + Math.max(Math.min(rect.height / 2, 22), 14)
    ring.style.left = `${Math.max(rect.left - padding, 6)}px`
    ring.style.top = `${Math.max(rect.top - padding, 6)}px`
    ring.style.width = `${Math.max(rect.width + padding * 2, 44)}px`
    ring.style.height = `${Math.max(rect.height + padding * 2, 44)}px`
    ring.classList.remove('hidden')
    cursor.style.left = `${Math.min(Math.max(cursorX, 16), window.innerWidth - 16)}px`
    cursor.style.top = `${Math.min(Math.max(cursorY, 16), window.innerHeight - 16)}px`
    cursor.classList.remove('hidden')

    badge.style.left = '50%'
    badge.style.top = '20px'
    badge.style.transform = 'translateX(-50%)'
    badge.hidden = false
  } else {
    ring.classList.add('hidden')
    cursor.style.left = `${Math.min(window.innerWidth - 28, 72)}px`
    cursor.style.top = '72px'
    cursor.classList.remove('hidden')
    badge.style.left = '50%'
    badge.style.top = '20px'
    badge.style.transform = 'translateX(-50%)'
    badge.hidden = false
  }
}

function describeAction(actionType?: string) {
  switch (actionType) {
    case 'click':
      return 'Clicking on the page'
    case 'type':
      return 'Typing into the page'
    case 'extract':
      return 'Reading the current page'
    case 'select':
      return 'Choosing an option'
    case 'scroll':
      return 'Scanning the page'
    case 'goto':
      return 'Opening a page'
    case 'screenshot':
      return 'Capturing the page'
    default:
      return 'Working on the page'
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  if (message.type === 'COLLECT_CONTEXT') {
    try {
      sendResponse(collectContext(message.options))
    } catch (err) {
      // If DOM inspection throws (e.g. CSP sandbox, framed page), return a
      // minimal stub so the background can fall through to its own fallback.
      sendResponse({ error: String(err) })
    }
    return true
  }

  if (message.type === 'TASK_OVERLAY_SHOW') {
    showOverlay(message.payload ?? {})
    sendResponse({ ok: true })
    return true
  }

  if (message.type === 'TASK_OVERLAY_CLEAR') {
    clearOverlay()
    sendResponse({ ok: true })
    return true
  }
})

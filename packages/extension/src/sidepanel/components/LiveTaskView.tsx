import type { StreamState } from '../hooks/useTaskStream.js'

// ── Minimal line icons (Icon8 Outlined style) ─────────────────────────────────

function IconGoto() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 8h10M8 4l4 4-4 4" />
    </svg>
  )
}
function IconClick() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2l9 6-4 1-2 5z" />
    </svg>
  )
}
function IconType() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2l4 4-8 8H2v-4z" />
    </svg>
  )
}
function IconSelect() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <path d="M5 8l3 3 3-3" />
    </svg>
  )
}
function IconScroll() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="2" x2="8" y2="14" />
      <path d="M4 6l4-4 4 4M4 10l4 4 4-4" />
    </svg>
  )
}
function IconHover() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2v6M8 4v4M10 5v3M4 7v3a4 4 0 008 0V7H4z" />
    </svg>
  )
}
function IconPress() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="8" rx="1" />
      <line x1="4" y1="8" x2="5" y2="8" />
      <line x1="7.5" y1="8" x2="8.5" y2="8" />
      <line x1="11" y1="8" x2="12" y2="8" />
      <line x1="5.5" y1="10" x2="10.5" y2="10" />
    </svg>
  )
}
function IconWait() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2.5 1.5" />
    </svg>
  )
}
function IconExtract() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" />
      <path d="M9 1v4h4" />
      <line x1="5" y1="9" x2="11" y2="9" />
      <line x1="5" y1="12" x2="8" y2="12" />
    </svg>
  )
}
function IconScreenshot() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="14" height="10" rx="1" />
      <circle cx="8" cy="9" r="2.5" />
      <path d="M5 4l1.5-2h3L11 4" />
    </svg>
  )
}
function IconDefault() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="6" />
      <line x1="8" y1="6" x2="8" y2="8" />
      <line x1="8" y1="10.5" x2="8" y2="11" />
    </svg>
  )
}

function ActionIcon({ type }: { type: string }) {
  switch (type) {
    case 'goto': return <IconGoto />
    case 'click': return <IconClick />
    case 'type': return <IconType />
    case 'select': return <IconSelect />
    case 'scroll': return <IconScroll />
    case 'hover': return <IconHover />
    case 'press':
    case 'pressKey': return <IconPress />
    case 'wait_for_selector':
    case 'wait_for_text': return <IconWait />
    case 'extract': return <IconExtract />
    case 'screenshot': return <IconScreenshot />
    default: return <IconDefault />
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  pending: '#2a2a2a',
  running: '#3b82f6',
  done: '#22c55e',
  failed: '#ef4444',
  awaiting_approval: '#a855f7',
  skipped: '#374151',
}

const TASK_STATUS_LABEL: Record<string, string> = {
  idle: 'idle',
  submitting: 'submitting',
  planning: 'planning',
  streaming: 'running',
  done: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
  awaiting_approval: 'awaiting approval',
  error: 'error',
}

function StepStatusMark({ status }: { status: string }) {
  if (status === 'running') return <DotSpinner />
  if (status === 'done') return <span style={{ color: '#22c55e' }}>✓</span>
  if (status === 'failed') return <span style={{ color: '#ef4444' }}>✗</span>
  if (status === 'awaiting_approval') return <span style={{ color: '#a855f7' }}>?</span>
  return <span style={{ color: '#2a2a2a' }}>·</span>
}

function DotSpinner() {
  return (
    <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            width: 3,
            height: 3,
            background: '#3b82f6',
            borderRadius: '50%',
            animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  state: StreamState
}

export function LiveTaskView({ state }: Props) {
  const { status, steps, durationMs, error, prompt } = state

  const doneCount = steps.filter((s) => s.status === 'done').length
  const failedCount = steps.filter((s) => s.status === 'failed').length
  const answer = buildAnswer(state)

  const isActive =
    status === 'streaming' || status === 'planning' || status === 'submitting'
  const isTerminal =
    status === 'done' || status === 'failed' || status === 'cancelled' || status === 'error'

  const headerAccentColor =
    status === 'done'
      ? '#22c55e'
      : status === 'failed' || status === 'error'
        ? '#ef4444'
        : status === 'cancelled'
          ? '#f59e0b'
          : status === 'awaiting_approval'
            ? '#a855f7'
            : '#3b82f6'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          background: '#0c0c0c',
          borderTop: `2px solid ${headerAccentColor}`,
          border: '1px solid #1e1e1e',
          borderTopColor: headerAccentColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: '#6b7280',
            flex: 1,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
          title={prompt}
        >
          {prompt}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isActive && (
            <span
              style={{
                display: 'inline-block',
                width: 5,
                height: 5,
                background: '#3b82f6',
                animation: 'pulse 1s ease-in-out infinite',
              }}
            />
          )}
          <span
            style={{
              fontSize: 11,
              color: STATUS_COLOR[status] ?? '#666',
              fontFamily: 'monospace',
              letterSpacing: '0.03em',
            }}
          >
            {TASK_STATUS_LABEL[status] ?? status}
          </span>
          {durationMs !== null && (
            <span style={{ fontSize: 10, color: '#333', fontFamily: 'monospace' }}>
              {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div
          style={{
            border: '1px solid #1e1e1e',
            borderTop: 'none',
            background: '#090909',
          }}
        >
          {steps.map((step, i) => {
            const active = step.status === 'running' || step.status === 'awaiting_approval'
            const statusColor = STATUS_COLOR[step.status] ?? '#2a2a2a'

            return (
              <div
                key={step.index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '6px 12px',
                  borderBottom: i < steps.length - 1 ? '1px solid #0f0f0f' : 'none',
                  borderLeft: `2px solid ${active ? statusColor : 'transparent'}`,
                  background: active ? '#0d0d16' : 'transparent',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: '#242424',
                    minWidth: 14,
                    paddingTop: 1,
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    flexShrink: 0,
                  }}
                >
                  {step.index + 1}
                </span>
                <span
                  style={{
                    color: active ? '#4b5563' : '#2a2a2a',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    paddingTop: 1,
                  }}
                >
                  <ActionIcon type={step.actionType} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: active ? '#d1d5db' : '#4b5563',
                      lineHeight: 1.35,
                    }}
                  >
                    {step.description}
                  </div>
                  {step.result && step.status === 'done' && step.actionType !== 'extract' && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#374151',
                        marginTop: 2,
                        fontFamily: 'monospace',
                      }}
                    >
                      {step.result}
                    </div>
                  )}
                  {step.error && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#ef4444',
                        marginTop: 2,
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {step.error}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    flexShrink: 0,
                    paddingTop: 1,
                    minWidth: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <StepStatusMark status={step.status} />
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Thinking indicator */}
      {isActive && steps.length === 0 && (
        <div
          style={{
            padding: '8px 12px',
            border: '1px solid #1e1e1e',
            borderTop: 'none',
            fontSize: 11,
            color: '#374151',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#090909',
          }}
        >
          <DotSpinner />
          {status === 'planning' ? 'Building plan…' : 'Connecting…'}
        </div>
      )}

      {/* Extracted text output */}
      {answer && (
        <div
          style={{
            border: '1px solid #1e1e1e',
            borderTop: 'none',
          }}
        >
          <div
            style={{
              padding: '4px 12px',
              fontSize: 10,
              color: '#2a2a2a',
              background: '#090909',
              borderBottom: '1px solid #111',
              fontFamily: 'monospace',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            output
          </div>
          <div
            style={{
              padding: '10px 12px',
              fontSize: 12,
              color: '#9ca3af',
              fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#070707',
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {answer}
          </div>
        </div>
      )}

      {/* Summary footer */}
      {isTerminal && steps.length > 0 && (
        <div
          style={{
            padding: '4px 12px',
            border: '1px solid #1e1e1e',
            borderTop: 'none',
            display: 'flex',
            gap: 10,
            fontSize: 10,
            color: '#2a2a2a',
            background: '#090909',
            fontFamily: 'monospace',
          }}
        >
          <span style={{ color: '#22c55e' }}>{doneCount} done</span>
          {failedCount > 0 && <span style={{ color: '#ef4444' }}>{failedCount} failed</span>}
          <span>{steps.length} total</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '8px 12px',
            border: '1px solid #ef444430',
            borderTop: 'none',
            fontSize: 12,
            color: '#ef4444',
            fontFamily: 'monospace',
            background: '#080505',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

function buildAnswer(state: StreamState) {
  const extracts = state.steps
    .filter((s) => s.status === 'done' && s.actionType === 'extract' && s.result)
    .map((s) => s.result!.trim())
    .filter(Boolean)

  if (extracts.length === 0) return ''
  const unique = Array.from(new Set(extracts))
  return unique.length === 1 ? unique[0] : unique.join('\n\n---\n\n')
}

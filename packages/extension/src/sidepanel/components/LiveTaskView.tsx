import type { StreamState } from '../hooks/useTaskStream.js'

const ACTION_ICONS: Record<string, string> = {
  goto: '🌐',
  click: '🖱️',
  type: '⌨️',
  select: '📋',
  scroll: '↕️',
  hover: '👆',
  press: '⌨️',
  wait_for_selector: '⏳',
  wait_for_text: '⏳',
  extract: '📤',
  screenshot: '📸',
}

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  pending: { color: '#475569', label: 'Pending' },
  running: { color: '#f59e0b', label: 'Running' },
  done: { color: '#22c55e', label: 'Done' },
  failed: { color: '#ef4444', label: 'Failed' },
  awaiting_approval: { color: '#a855f7', label: 'Approval' },
  skipped: { color: '#475569', label: 'Skipped' },
}

interface Props {
  state: StreamState
}

export function LiveTaskView({ state }: Props) {
  const { status, steps, stepCount, durationMs, error, prompt } = state

  const doneCount = steps.filter((s) => s.status === 'done').length
  const failedCount = steps.filter((s) => s.status === 'failed').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Task header */}
      <div
        style={{
          background: '#1e1e2e',
          border: `1px solid ${
            status === 'done'
              ? '#22c55e33'
              : status === 'failed' || status === 'error'
              ? '#ef444433'
              : status === 'awaiting_approval'
              ? '#a855f733'
              : '#313150'
          }`,
          borderRadius: 8,
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: '#64748b',
            marginBottom: 4,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>
            <StatusDot status={status} /> {TASK_STATUS_LABEL[status] ?? status}
          </span>
          {durationMs !== null && (
            <span>{(durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
        <div
          style={{
            fontSize: 13,
            color: '#cbd5e1',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {prompt}
        </div>
        {stepCount > 0 && (
          <div style={{ marginTop: 6, display: 'flex', gap: 10, fontSize: 11, color: '#64748b' }}>
            <span style={{ color: '#22c55e' }}>{doneCount} done</span>
            {failedCount > 0 && <span style={{ color: '#ef4444' }}>{failedCount} failed</span>}
            <span>{stepCount} total</span>
          </div>
        )}
      </div>

      {/* Steps timeline */}
      {steps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {steps.map((step) => {
            const cfg = STATUS_STYLE[step.status] ?? STATUS_STYLE.pending
            return (
              <div
                key={step.index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '7px 10px',
                  background: '#16162a',
                  border: `1px solid ${cfg.color}22`,
                  borderLeft: `3px solid ${step.status === 'running' ? cfg.color : cfg.color + '55'}`,
                  borderRadius: '0 6px 6px 0',
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Step number */}
                <span style={{ fontSize: 10, color: '#334155', minWidth: 16, paddingTop: 1 }}>
                  {step.index + 1}
                </span>

                {/* Icon */}
                <span style={{ fontSize: 13, flexShrink: 0 }}>
                  {ACTION_ICONS[step.actionType] ?? '▸'}
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: step.status === 'running' ? '#e2e8f0' : '#94a3b8',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {step.description}
                  </div>

                  {step.result && step.status === 'done' && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#64748b',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {step.result}
                    </div>
                  )}

                  {step.error && (
                    <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>
                      {step.error}
                    </div>
                  )}
                </div>

                {/* Status */}
                <span
                  style={{
                    fontSize: 10,
                    color: cfg.color,
                    fontWeight: 600,
                    flexShrink: 0,
                    paddingTop: 1,
                  }}
                >
                  {step.status === 'running' ? <Spinner /> : cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Streaming indicator (before any steps appear) */}
      {status === 'streaming' && steps.length === 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: '#1a1500',
            border: '1px solid #f59e0b22',
            borderRadius: 8,
            fontSize: 12,
            color: '#f59e0b',
          }}
        >
          <Spinner /> Planning…
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: '#1a0a0a',
            border: '1px solid #ef444433',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            color: '#ef4444',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

const TASK_STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  submitting: 'Submitting…',
  streaming: 'Running',
  done: 'Completed',
  failed: 'Failed',
  awaiting_approval: 'Awaiting approval',
  error: 'Error',
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: '#475569',
    submitting: '#f59e0b',
    streaming: '#f59e0b',
    done: '#22c55e',
    failed: '#ef4444',
    awaiting_approval: '#a855f7',
    error: '#ef4444',
  }
  const color = colors[status] ?? '#475569'
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        marginRight: 4,
        verticalAlign: 'middle',
      }}
    />
  )
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        animation: 'spin 0.8s linear infinite',
        fontSize: 12,
      }}
    >
      ⟳
    </span>
  )
}

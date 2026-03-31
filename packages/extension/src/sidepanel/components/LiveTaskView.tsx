import type { StreamState } from '../hooks/useTaskStream.js'

const ACTION_ICONS: Record<string, string> = {
  goto: 'GL',
  click: 'CL',
  type: 'TY',
  select: 'SE',
  scroll: 'SC',
  hover: 'HO',
  press: 'PR',
  wait_for_selector: 'WT',
  wait_for_text: 'WT',
  extract: 'EX',
  screenshot: 'SS',
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

  const doneCount = steps.filter((step) => step.status === 'done').length
  const failedCount = steps.filter((step) => step.status === 'failed').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          background: '#1e1e2e',
          border: `1px solid ${getHeaderBorder(status)}`,
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
          {durationMs !== null && <span>{(durationMs / 1000).toFixed(1)}s</span>}
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
                  borderLeft: `3px solid ${step.status === 'running' ? cfg.color : `${cfg.color}55`}`,
                  borderRadius: '0 6px 6px 0',
                }}
              >
                <span style={{ fontSize: 10, color: '#334155', minWidth: 16, paddingTop: 1 }}>
                  {step.index + 1}
                </span>

                <span
                  style={{
                    fontSize: 10,
                    flexShrink: 0,
                    minWidth: 18,
                    color: '#94a3b8',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  {ACTION_ICONS[step.actionType] ?? '??'}
                </span>

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
                    <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{step.error}</div>
                  )}
                </div>

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
          <Spinner /> Waiting for execution...
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#1a0a0a',
            border: '1px solid #ef444433',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
            color: '#ef4444',
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

function getHeaderBorder(status: StreamState['status']) {
  if (status === 'done') return '#22c55e33'
  if (status === 'failed' || status === 'error') return '#ef444433'
  if (status === 'cancelled') return '#f59e0b33'
  if (status === 'awaiting_approval') return '#a855f733'
  return '#313150'
}

const TASK_STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  submitting: 'Submitting...',
  planning: 'Planning...',
  streaming: 'Running',
  done: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  awaiting_approval: 'Awaiting approval',
  error: 'Error',
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    idle: '#475569',
    submitting: '#f59e0b',
    planning: '#f59e0b',
    streaming: '#f59e0b',
    done: '#22c55e',
    failed: '#ef4444',
    cancelled: '#f59e0b',
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
      O
    </span>
  )
}

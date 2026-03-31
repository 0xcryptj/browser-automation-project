import type { Action, ActionSensitivity } from '@browser-automation/shared'

interface Props {
  taskId: string
  step: { step: number; action: Action; status: string }
  onApprove: (taskId: string, stepIndex: number, approved: boolean) => void
}

const SENSITIVITY: Record<ActionSensitivity, { color: string; label: string; icon: string }> = {
  none:    { color: '#a855f7', label: 'Action',        icon: '⚠️' },
  submit:  { color: '#f59e0b', label: 'Form Submit',   icon: '📤' },
  delete:  { color: '#ef4444', label: 'Delete',        icon: '🗑️' },
  payment: { color: '#ef4444', label: 'Payment',       icon: '💳' },
  send:    { color: '#f59e0b', label: 'Send / Publish', icon: '📨' },
}

export function ApprovalModal({ taskId, step, onApprove }: Props) {
  const sensitivity = step.action.sensitivity ?? 'none'
  const cfg = SENSITIVITY[sensitivity] ?? SENSITIVITY.none

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: '#1e1e2e',
          border: `1px solid ${cfg.color}`,
          borderRadius: 12,
          padding: 20,
          maxWidth: 340,
          width: '100%',
          boxShadow: `0 0 40px ${cfg.color}33`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>{cfg.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>Approval Required</div>
            <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600, marginTop: 1 }}>
              {cfg.label}
            </div>
          </div>
        </div>

        {/* Approval reason */}
        {step.action.approvalReason && (
          <div
            style={{
              background: `${cfg.color}15`,
              border: `1px solid ${cfg.color}33`,
              borderRadius: 6,
              padding: '7px 10px',
              marginBottom: 12,
              fontSize: 12,
              color: '#cbd5e1',
              lineHeight: 1.5,
            }}
          >
            {step.action.approvalReason}
          </div>
        )}

        {/* Step detail */}
        <div
          style={{
            background: '#0f0f1a',
            border: '1px solid #2d2d44',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, color: cfg.color, fontWeight: 600, marginBottom: 4 }}>
            Step {step.step + 1} · {step.action.type.toUpperCase()}
          </div>
          <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.4 }}>
            {step.action.description}
          </div>
          {step.action.selector && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>
              Target:{' '}
              <code style={{ color: '#94a3b8', background: '#0a0a14', padding: '1px 4px', borderRadius: 3 }}>
                {step.action.selector}
              </code>
            </div>
          )}
          {step.action.value && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
              Value:{' '}
              <code style={{ color: '#94a3b8', background: '#0a0a14', padding: '1px 4px', borderRadius: 3 }}>
                "{step.action.value}"
              </code>
            </div>
          )}
          {step.action.url && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              URL: <span style={{ color: '#94a3b8' }}>{step.action.url}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApprove(taskId, step.step, false)}
            style={{
              flex: 1,
              background: '#1e1e2e',
              border: '1px solid #ef4444',
              color: '#ef4444',
              borderRadius: 8,
              padding: '9px 0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Deny
          </button>
          <button
            onClick={() => onApprove(taskId, step.step, true)}
            style={{
              flex: 1,
              background: cfg.color,
              border: 'none',
              color: '#fff',
              borderRadius: 8,
              padding: '9px 0',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}

import type { ActionStep } from '@browser-automation/shared'

interface Props {
  taskId: string
  step: ActionStep
  onApprove: (taskId: string, stepIndex: number, approved: boolean) => void
}

export function ApprovalModal({ taskId, step, onApprove }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
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
          border: '1px solid #a855f7',
          borderRadius: 12,
          padding: 20,
          maxWidth: 340,
          width: '100%',
          boxShadow: '0 0 40px rgba(168,85,247,0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0' }}>Approval Required</span>
        </div>

        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 }}>
          This action requires your confirmation before executing:
        </p>

        <div
          style={{
            background: '#0f0f1a',
            border: '1px solid #2d2d44',
            borderRadius: 8,
            padding: '10px 12px',
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 11, color: '#a855f7', fontWeight: 600, marginBottom: 4 }}>
            Step {step.step + 1} · {step.action.type.toUpperCase()}
          </div>
          <div style={{ fontSize: 13, color: '#e2e8f0' }}>{step.action.description}</div>
          {step.action.selector && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              Target: <code style={{ color: '#94a3b8' }}>{step.action.selector}</code>
            </div>
          )}
          {step.action.value && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Value: <code style={{ color: '#94a3b8' }}>"{step.action.value}"</code>
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
              padding: '8px 0',
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
              background: '#a855f7',
              border: 'none',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 0',
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

import type { CSSProperties } from 'react'
import type { Action, ActionSensitivity } from '@browser-automation/shared'

interface Props {
  taskId: string
  step: { step: number; action: Action; status: string }
  onApprove: (taskId: string, stepIndex: number, approved: boolean) => void
}

const SENSITIVITY: Record<ActionSensitivity, { color: string; label: string }> = {
  none: { color: '#a855f7', label: 'Action' },
  submit: { color: '#f59e0b', label: 'Form submit' },
  delete: { color: '#ef4444', label: 'Delete' },
  payment: { color: '#ef4444', label: 'Payment' },
  send: { color: '#f59e0b', label: 'Send or publish' },
}

export function ApprovalModal({ taskId, step, onApprove }: Props) {
  const sensitivity = step.action.sensitivity ?? 'none'
  const cfg = SENSITIVITY[sensitivity] ?? SENSITIVITY.none

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3,7,18,0.52)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        padding: 18,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 22,
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '16px 18px 14px',
            borderBottom: '1px solid var(--border)',
            background: `linear-gradient(180deg, ${cfg.color}12, transparent)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: cfg.color,
                boxShadow: `0 0 0 6px ${cfg.color}18`,
                flexShrink: 0,
              }}
            />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Approval required</div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.5 }}>
            The assistant wants to continue with a sensitive step. Review the target below before approving.
          </div>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              alignSelf: 'flex-start',
              padding: '5px 9px',
              borderRadius: 999,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: cfg.color,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color }} />
            {cfg.label}
          </div>

          {step.action.approvalReason && (
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                fontSize: 12,
                color: 'var(--text-soft)',
                lineHeight: 1.55,
              }}
            >
              {step.action.approvalReason}
            </div>
          )}

          <div
            style={{
              padding: '12px 13px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              Step {step.step + 1} · {step.action.type}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45, fontWeight: 600 }}>
              {step.action.description}
            </div>

            {step.action.elementRef && <MetaRow label="Ref" value={step.action.elementRef} />}
            {step.action.selector && <MetaRow label="Target" value={step.action.selector} />}
            {step.action.value && <MetaRow label="Value" value={step.action.value} />}
            {step.action.url && <MetaRow label="URL" value={step.action.url} />}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => onApprove(taskId, step.step, false)} style={denyButtonStyle}>
              Deny
            </button>
            <button
              onClick={() => onApprove(taskId, step.step, true)}
              style={{
                ...approveButtonStyle,
                background: cfg.color,
                boxShadow: `0 12px 24px ${cfg.color}22`,
              }}
            >
              Approve
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-soft)',
          lineHeight: 1.5,
          wordBreak: 'break-word',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '7px 9px',
        }}
      >
        {value}
      </div>
    </div>
  )
}

const denyButtonStyle: CSSProperties = {
  flex: 1,
  background: 'var(--surface)',
  border: '1px solid var(--danger-border)',
  color: 'var(--danger)',
  borderRadius: 999,
  padding: '10px 0',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const approveButtonStyle: CSSProperties = {
  flex: 1,
  border: 'none',
  color: '#ffffff',
  borderRadius: 999,
  padding: '10px 0',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
}

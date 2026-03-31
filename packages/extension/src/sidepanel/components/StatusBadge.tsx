import type { StepStatus } from '@browser-automation/shared'

const CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#64748b' },
  running: { label: 'Running…', color: '#f59e0b' },
  done: { label: 'Done', color: '#22c55e' },
  failed: { label: 'Failed', color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#f59e0b' },
  awaiting_approval: { label: 'Needs Approval', color: '#a855f7' },
  skipped: { label: 'Skipped', color: '#94a3b8' },
  planned: { label: 'Planned', color: '#3b82f6' },
  connected: { label: 'Connected', color: '#22c55e' },
  disconnected: { label: 'Offline', color: '#ef4444' },
  checking: { label: 'Checking…', color: '#f59e0b' },
}

export function StatusBadge({ status }: { status: StepStatus | string }) {
  const cfg = CONFIG[status] ?? { label: status, color: '#64748b' }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontWeight: 600,
        color: cfg.color,
        background: cfg.color + '22',
        border: `1px solid ${cfg.color}44`,
        borderRadius: 4,
        padding: '2px 7px',
        letterSpacing: '0.02em',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
        }}
      />
      {cfg.label}
    </span>
  )
}

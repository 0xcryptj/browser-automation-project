import type { StepStatus } from '@browser-automation/shared'

const CONFIG: Record<string, { label: string; color: string; pulse?: boolean }> = {
  pending: { label: 'Pending', color: '#64748b' },
  running: { label: 'Running...', color: '#3b82f6', pulse: true },
  done: { label: 'Done', color: '#22c55e' },
  failed: { label: 'Failed', color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#f59e0b' },
  awaiting_approval: { label: 'Needs Approval', color: '#a855f7', pulse: true },
  skipped: { label: 'Skipped', color: '#94a3b8' },
  planned: { label: 'Planned', color: '#3b82f6' },
  connected: { label: 'Connected', color: '#22c55e' },
  disconnected: { label: 'Offline', color: '#ef4444' },
  checking: { label: 'Checking...', color: '#94a3b8', pulse: true },
}

export function StatusBadge({ status }: { status: StepStatus | string }) {
  const cfg = CONFIG[status] ?? { label: status, color: '#64748b' }

  return (
    <span
      role="status"
      aria-label={cfg.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--text)',
        background: 'var(--glass-button)',
        border: '1px solid var(--glass-border)',
        borderRadius: 999,
        padding: '4px 9px',
        letterSpacing: '-0.01em',
        backdropFilter: 'blur(18px) saturate(1.25)',
        boxShadow: 'var(--glass-shadow-soft)',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
          boxShadow: `0 0 0 3px ${cfg.color}22`,
          // Use will-change only when animating to avoid compositing cost at rest
          willChange: cfg.pulse ? 'opacity' : undefined,
          animation: cfg.pulse ? 'pulse 1.4s ease-in-out infinite' : undefined,
        }}
      />
      {cfg.label}
    </span>
  )
}

import type { StepStatus } from '@browser-automation/shared'

const CONFIG: Record<string, { label: string; color: string; pulse?: boolean }> = {
  pending: { label: 'Pending', color: '#86868b' },
  running: { label: 'Running', color: '#0a84ff', pulse: true },
  done: { label: 'Done', color: '#34d399' },
  failed: { label: 'Failed', color: '#ff453a' },
  cancelled: { label: 'Cancelled', color: '#ff9500' },
  awaiting_approval: { label: 'Approval', color: '#bf5af2', pulse: true },
  skipped: { label: 'Skipped', color: '#86868b' },
  planned: { label: 'Planned', color: '#0a84ff' },
  connected: { label: 'Connected', color: '#34d399' },
  disconnected: { label: 'Offline', color: '#ff453a' },
  checking: { label: 'Checking', color: '#86868b', pulse: true },
}

export function StatusBadge({ status }: { status: StepStatus | string }) {
  const cfg = CONFIG[status] ?? { label: status, color: '#86868b' }

  return (
    <span
      role="status"
      aria-label={cfg.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--muted)',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
          willChange: cfg.pulse ? 'opacity' : undefined,
          animation: cfg.pulse ? 'pulse 1.4s ease-in-out infinite' : undefined,
        }}
      />
      {cfg.label}
    </span>
  )
}

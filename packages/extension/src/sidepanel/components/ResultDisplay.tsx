import type { TaskResult } from '@browser-automation/shared'
import { StatusBadge } from './StatusBadge.js'

interface Props {
  result: TaskResult
}

function ActionIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
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
  return <span style={{ fontSize: 14 }}>{icons[type] ?? '▸'}</span>
}

export function ResultDisplay({ result }: Props) {
  const { plan, observation, durationMs } = result
  const screenshots = plan.steps
    .filter((s) => s.screenshot)
    .map((s) => s.screenshot!)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div
        style={{
          background: '#1e1e2e',
          border: '1px solid #313150',
          borderRadius: 8,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Task Result</div>
          <div
            style={{
              fontSize: 12,
              color: '#e2e8f0',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {plan.prompt}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <StatusBadge status={plan.status} />
          {durationMs !== undefined && (
            <span style={{ fontSize: 10, color: '#64748b' }}>{(durationMs / 1000).toFixed(1)}s</span>
          )}
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {plan.steps.map((step, i) => (
          <div
            key={i}
            style={{
              background: '#1a1a2a',
              border: `1px solid ${
                step.status === 'done'
                  ? '#22c55e33'
                  : step.status === 'failed'
                  ? '#ef444433'
                  : step.status === 'awaiting_approval'
                  ? '#a855f733'
                  : '#313150'
              }`,
              borderRadius: 6,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <ActionIcon type={step.action.type} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: '#e2e8f0',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {step.action.description}
              </div>
              {step.result && (
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
            <StatusBadge status={step.status} />
          </div>
        ))}
      </div>

      {/* Screenshot */}
      {screenshots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
            Final Screenshot
          </div>
          <img
            src={`data:image/png;base64,${screenshots[screenshots.length - 1]}`}
            alt="Page screenshot"
            style={{
              width: '100%',
              borderRadius: 6,
              border: '1px solid #313150',
              display: 'block',
            }}
          />
        </div>
      )}

      {/* Observation */}
      {observation && (
        <div
          style={{
            background: '#1a1a2a',
            border: '1px solid #313150',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 11,
            color: '#64748b',
          }}
        >
          <span style={{ color: '#94a3b8', fontWeight: 600 }}>Final URL: </span>
          <span style={{ color: '#6366f1' }}>{observation.url}</span>
        </div>
      )}

      {/* Error */}
      {result.error && (
        <div
          style={{
            background: '#1a0a0a',
            border: '1px solid #ef444433',
            borderRadius: 6,
            padding: '8px 10px',
            fontSize: 12,
            color: '#ef4444',
          }}
        >
          {result.error}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <button
      onClick={() => void handleCopy()}
      aria-label={copied ? 'Copied' : 'Copy result'}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      style={{
        background: 'var(--glass-button)',
        border: '1px solid var(--glass-border)',
        borderRadius: 8,
        color: copied ? '#22c55e' : 'var(--muted)',
        fontSize: 10,
        fontWeight: 600,
        padding: '3px 7px',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'color 150ms ease',
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function ResultDisplay({ result }: Props) {
  const { plan, observation, durationMs } = result
  const screenshots = plan.steps
    .filter((s) => s.screenshot)
    .map((s) => s.screenshot!)

  // Collect all extract results for top-level copy
  const extractResults = plan.steps
    .filter((s) => s.status === 'done' && s.result)
    .map((s) => s.result!)
    .filter(Boolean)
  const copyableResult = extractResults.join('\n\n')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--glass-border)',
          borderRadius: 16,
          padding: '10px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          backdropFilter: 'blur(20px)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>Task Result</div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={plan.prompt}
          >
            {plan.prompt}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <StatusBadge status={plan.status} />
          {durationMs !== undefined && (
            <span style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {plan.steps.map((step, i) => (
          <div
            key={i}
            style={{
              background: 'var(--panel)',
              border: `1px solid ${
                step.status === 'done'
                  ? 'rgba(34,197,94,0.22)'
                  : step.status === 'failed'
                  ? 'rgba(239,68,68,0.22)'
                  : step.status === 'awaiting_approval'
                  ? 'rgba(168,85,247,0.22)'
                  : 'var(--glass-border)'
              }`,
              borderRadius: 12,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              backdropFilter: 'blur(18px)',
            }}
          >
            <ActionIcon type={step.action.type} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={step.action.description}
              >
                {step.action.description}
              </div>
              {step.result && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-soft)',
                    marginTop: 2,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: 120,
                    overflowY: 'auto',
                  }}
                >
                  {step.result}
                </div>
              )}
              {step.error && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--danger)',
                    marginTop: 4,
                    padding: '5px 7px',
                    background: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                    borderRadius: 8,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {step.error}
                </div>
              )}
            </div>
            <StatusBadge status={step.status} />
          </div>
        ))}
      </div>

      {/* Copy result button if there are extract results */}
      {copyableResult && (
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--panel)',
            border: '1px solid var(--glass-border)',
            borderRadius: 14,
            backdropFilter: 'blur(20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Extracted result</span>
            <CopyButton text={copyableResult} />
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-soft)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            {copyableResult}
          </div>
        </div>
      )}

      {/* Screenshot */}
      {screenshots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            Final Screenshot
          </div>
          <img
            src={`data:image/png;base64,${screenshots[screenshots.length - 1]}`}
            alt="Final page screenshot captured during task"
            style={{
              width: '100%',
              borderRadius: 10,
              border: '1px solid var(--glass-border)',
              display: 'block',
              maxHeight: 360,
              objectFit: 'contain',
              background: 'var(--surface)',
            }}
          />
        </div>
      )}

      {/* Observation */}
      {observation && (
        <div
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--glass-border)',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 11,
            color: 'var(--muted)',
            backdropFilter: 'blur(18px)',
            overflow: 'hidden',
          }}
        >
          <span style={{ color: 'var(--text-soft)', fontWeight: 600 }}>Final URL: </span>
          <span
            style={{
              color: '#6366f1',
              wordBreak: 'break-all',
            }}
          >
            {observation.url}
          </span>
        </div>
      )}

      {/* Error */}
      {result.error && (
        <div
          style={{
            background: 'var(--danger-bg)',
            border: '1px solid var(--danger-border)',
            borderRadius: 10,
            padding: '8px 10px',
            fontSize: 12,
            color: 'var(--danger)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {result.error}
        </div>
      )}
    </div>
  )
}

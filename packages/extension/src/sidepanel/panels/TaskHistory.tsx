import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { HistoryEntry } from '@browser-automation/shared'
import { clearHistory, getHistory } from '../../lib/storage.js'

interface Props {
  onRerun?: (prompt: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  done: '#22c55e',
  failed: '#ef4444',
  cancelled: '#f59e0b',
  awaiting_approval: '#a855f7',
}

export function TaskHistory({ onRerun }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    getHistory().then((items) => {
      setHistory(items)
      setLoading(false)
    })
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleClear = async () => {
    await clearHistory()
    setHistory([])
  }

  if (loading) {
    return <div style={{ padding: 16, color: 'var(--muted)', fontSize: 12 }}>Loading history...</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>Task history</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {history.length} saved task{history.length !== 1 ? 's' : ''}
          </div>
        </div>

        {history.length > 0 && (
          <button onClick={handleClear} style={clearButtonStyle}>
            Clear
          </button>
        )}
      </div>

      {history.length === 0 && (
        <div
          style={{
            padding: '26px 18px',
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: 18,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              margin: '0 auto 12px',
              borderRadius: '50%',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HistoryIcon />
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>No history yet</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Completed, failed, and cancelled tasks will show up here so you can rerun them quickly.
          </div>
        </div>
      )}

      {history.map((entry) => {
        const color = STATUS_COLORS[entry.status] ?? '#94a3b8'

        return (
          <button
            key={entry.id}
            onClick={() => onRerun?.(entry.prompt)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '13px 14px',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 18,
              cursor: onRerun ? 'pointer' : 'default',
              textAlign: 'left',
              boxShadow: '0 10px 24px rgba(0,0,0,0.16)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                {formatStatus(entry.status)}
              </span>

              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.45 }}>{entry.prompt}</div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--muted)' }}>
              <span>{entry.stepCount} steps</span>
              {entry.durationMs !== undefined && <span>{(entry.durationMs / 1000).toFixed(1)}s</span>}
              {entry.url && <span>{safeHostname(entry.url)}</span>}
              {onRerun && <span style={{ color: '#60a5fa' }}>Click to rerun</span>}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function HistoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2 6.2" />
      <path d="M2 2.5v3.7h3.7" />
      <path d="M8 5.2v3.2l2.1 1.2" />
    </svg>
  )
}

function formatStatus(status: string) {
  return status.replace(/_/g, ' ')
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const clearButtonStyle: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  color: 'var(--text-soft)',
  fontSize: 11,
  fontWeight: 600,
  padding: '7px 10px',
  cursor: 'pointer',
}

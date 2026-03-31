import { useState, useEffect } from 'react'
import type { HistoryEntry } from '@browser-automation/shared'
import { getHistory, clearHistory } from '../../lib/storage.js'

interface Props {
  onRerun?: (prompt: string) => void
}

export function TaskHistory({ onRerun }: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    getHistory().then((h) => { setHistory(h); setLoading(false) })
  }

  useEffect(() => { refresh() }, [])

  const handleClear = async () => {
    await clearHistory()
    setHistory([])
  }

  if (loading) return <div style={{ padding: 16, color: '#64748b', fontSize: 12 }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b' }}>{history.length} task{history.length !== 1 ? 's' : ''}</span>
        {history.length > 0 && (
          <button
            onClick={handleClear}
            style={{ background: 'none', border: '1px solid #313150', borderRadius: 4, color: '#64748b', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      {history.length === 0 && (
        <div style={{ textAlign: 'center', color: '#1e293b', fontSize: 12, padding: '24px 0' }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🕒</div>
          <div style={{ color: '#334155' }}>No tasks yet</div>
        </div>
      )}

      {history.map((entry) => (
        <div
          key={entry.id}
          style={{
            background: '#16162a',
            border: '1px solid #1e1e2e',
            borderRadius: 8,
            padding: '9px 11px',
            cursor: onRerun ? 'pointer' : 'default',
          }}
          onClick={() => onRerun?.(entry.prompt)}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color:
                  entry.status === 'done'
                    ? '#22c55e'
                    : entry.status === 'failed'
                    ? '#ef4444'
                    : entry.status === 'cancelled'
                    ? '#f59e0b'
                    : entry.status === 'awaiting_approval'
                    ? '#a855f7'
                    : '#94a3b8',
              }}
            >
              {entry.status.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, color: '#334155' }}>
              {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <div
            style={{
              fontSize: 12,
              color: '#94a3b8',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {entry.prompt}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, color: '#334155' }}>
            <span>{entry.stepCount} steps</span>
            {entry.durationMs !== undefined && <span>{(entry.durationMs / 1000).toFixed(1)}s</span>}
            {entry.url && (
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {new URL(entry.url).hostname}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

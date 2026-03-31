import { useState, useCallback } from 'react'
import type { ImportantInfoExtraction, PageObservation } from '@browser-automation/shared'
import { runnerClient } from '../../lib/runnerClient.js'

interface Props {
  pageObservation: PageObservation | null
  onCollectPage: () => Promise<PageObservation | null>
}

export function AssistPanel({ pageObservation, onCollectPage }: Props) {
  const [extraction, setExtraction] = useState<ImportantInfoExtraction | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleExtract = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const obs = pageObservation ?? (await onCollectPage())
      if (!obs) throw new Error('Could not collect page data')
      const result = await runnerClient.extractInfo(obs)
      setExtraction(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [pageObservation, onCollectPage])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Assist Mode</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Extract deadlines, job application signals, and next steps
          </div>
        </div>
        <button
          onClick={handleExtract}
          disabled={loading}
          style={{
            background: loading ? '#1e1e2e' : '#6366f1',
            border: 'none',
            borderRadius: 6,
            color: loading ? '#64748b' : '#fff',
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {loading ? 'Analyzing...' : 'Analyze Page'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#1a0a0a', border: '1px solid #ef444422', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#ef4444' }}>
          {error}
        </div>
      )}

      {extraction && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {extraction.isJobApplicationPage && (
            <div style={{ background: '#10261b', border: '1px solid #22c55e33', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, marginBottom: 4 }}>JOB APPLICATION DETECTED</div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                This page looks like a job application workflow.
              </div>
              {extraction.jobApplicationSignals.length > 0 && (
                <div style={{ fontSize: 11, color: '#86efac', marginTop: 4 }}>
                  Signals: {extraction.jobApplicationSignals.join(', ')}
                </div>
              )}
            </div>
          )}

          {extraction.summary && (
            <div style={{ background: '#16162a', border: '1px solid #313150', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, marginBottom: 4 }}>SUMMARY</div>
              <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>{extraction.summary}</div>
            </div>
          )}

          <DateSection
            title="Deadlines"
            color="#ef4444"
            items={[...extraction.deadlines, ...extraction.applicationDates]}
          />
          <DateSection title="Due Dates" color="#f59e0b" items={extraction.dueDates} />
          <DateSection title="Event Times" color="#3b82f6" items={extraction.eventTimes} />
          <ListSection title="Warnings" items={extraction.warnings} color="#f59e0b" />
          <ListSection title="Next Actions" items={extraction.nextActions} color="#22c55e" />
          <ListSection title="Calls To Action" items={extraction.callsToAction} color="#3b82f6" />
          <ListSection title="Required Materials" items={extraction.requiredMaterials} color="#a855f7" />
          <ListSection title="Missing Requirements" items={extraction.missingRequirements} color="#ef4444" />

          {extraction.extractedAt && (
            <div style={{ fontSize: 10, color: '#1e293b', textAlign: 'right' }}>
              Extracted {new Date(extraction.extractedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {!extraction && !loading && !error && (
        <div style={{ textAlign: 'center', color: '#1e293b', fontSize: 12, padding: '24px 0' }}>
          <div style={{ color: '#334155' }}>Click Analyze Page to extract deadlines, warnings, and next steps.</div>
        </div>
      )}
    </div>
  )
}

function DateSection({
  title,
  color,
  items,
}: {
  title: string
  color: string
  items: Array<{ label: string; date?: string; rawText: string; context?: string }>
}) {
  if (!items.length) return null
  return (
    <div>
      <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>{title}</div>
      {items.map((item, index) => (
        <div key={index} style={{ background: '#16162a', border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`, borderRadius: '0 6px 6px 0', padding: '7px 10px', marginBottom: 4 }}>
          <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{item.label}</div>
          {item.date && <div style={{ fontSize: 11, color, marginTop: 2 }}>{item.date}</div>}
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.rawText}</div>
          {item.context && <div style={{ fontSize: 10, color: '#334155', marginTop: 2 }}>{item.context}</div>}
        </div>
      ))}
    </div>
  )
}

function ListSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null
  return (
    <div>
      <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 5 }}>{title}</div>
      {items.map((item, index) => (
        <div key={index} style={{ display: 'flex', gap: 6, padding: '4px 0', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid #0f0f1a' }}>
          <span style={{ color, flexShrink: 0 }}>•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

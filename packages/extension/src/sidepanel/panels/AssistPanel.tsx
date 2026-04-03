import { useState, useCallback } from 'react'
import type { ImportantInfoExtraction, PageObservation } from '@browser-automation/shared'
import { runnerClient } from '../../lib/runnerClient.js'

interface Props {
  pageObservation: PageObservation | null
  onCollectPage: (mode?: 'task' | 'observe', behavior?: { quietOnFailure?: boolean }) => Promise<PageObservation | null>
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
      <div style={heroCardStyle}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Assist</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>
            AI summary of the current page with deadlines, job signals, and recommended next steps.
          </div>
        </div>
        <button onClick={handleExtract} disabled={loading} style={loading ? loadingButtonStyle : primaryButtonStyle}>
          {loading ? 'Analyzing...' : 'Analyze Page'}
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {extraction && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {extraction.summary && (
            <Card eyebrow="Summary" eyebrowColor="#93c5fd">
              <div style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.65 }}>{extraction.summary}</div>
            </Card>
          )}

          {extraction.isJobApplicationPage && (
            <Card eyebrow="Job Application" eyebrowColor="#34d399" accent="rgba(52,211,153,0.18)">
              <div style={{ fontSize: 13, color: 'var(--text-soft)' }}>
                This looks like a job application flow.
              </div>
              {extraction.jobApplicationSignals.length > 0 && (
                <div style={{ fontSize: 11, color: '#86efac', marginTop: 6, lineHeight: 1.5 }}>
                  Signals: {extraction.jobApplicationSignals.join(', ')}
                </div>
              )}
            </Card>
          )}

          <DateSection
            title="Deadlines"
            color="#f87171"
            items={[...extraction.deadlines, ...extraction.applicationDates]}
          />
          <DateSection title="Due Dates" color="#f59e0b" items={extraction.dueDates} />
          <DateSection title="Event Times" color="#60a5fa" items={extraction.eventTimes} />
          <ListSection title="Warnings" items={extraction.warnings} color="#f59e0b" />
          <ListSection title="Next Actions" items={extraction.nextActions} color="#34d399" />
          <ListSection title="Calls To Action" items={extraction.callsToAction} color="#60a5fa" />
          <ListSection title="Required Materials" items={extraction.requiredMaterials} color="#a78bfa" />
          <ListSection title="Missing Requirements" items={extraction.missingRequirements} color="#f87171" />

          {extraction.extractedAt && (
            <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>
              Extracted {new Date(extraction.extractedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}

      {!extraction && !loading && !error && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: '28px 0' }}>
          Analyze the page to get a short summary, warnings, and suggested next actions.
        </div>
      )}
    </div>
  )
}

function Card({
  eyebrow,
  eyebrowColor,
  children,
  accent,
}: {
  eyebrow: string
  eyebrowColor: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div
      style={{
        background: 'var(--panel)',
        border: `1px solid ${accent ?? 'var(--glass-border)'}`,
        borderRadius: 20,
        padding: '12px 14px',
        boxShadow: 'var(--glass-shadow-soft)',
        backdropFilter: 'blur(18px) saturate(1.18)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: eyebrowColor,
          fontWeight: 700,
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {eyebrow}
      </div>
      {children}
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
      <div style={sectionTitleStyle(color)}>{title}</div>
      {items.map((item, index) => (
        <div
          key={index}
          style={{
            background: 'var(--panel)',
            border: `1px solid ${color}22`,
            borderLeft: `3px solid ${color}`,
            borderRadius: 16,
            padding: '9px 11px',
            marginBottom: 6,
            boxShadow: 'var(--glass-shadow-soft)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{item.label}</div>
          {item.date && <div style={{ fontSize: 11, color, marginTop: 2 }}>{item.date}</div>}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{item.rawText}</div>
          {item.context && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, opacity: 0.82 }}>{item.context}</div>
          )}
        </div>
      ))}
    </div>
  )
}

function ListSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  if (!items.length) return null

  return (
    <div>
      <div style={sectionTitleStyle(color)}>{title}</div>
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--glass-border)',
          borderRadius: 18,
          padding: '2px 12px',
          boxShadow: 'var(--glass-shadow-soft)',
        }}
      >
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              gap: 8,
              padding: '9px 0',
              fontSize: 12,
              color: 'var(--text-soft)',
              borderBottom: index === items.length - 1 ? 'none' : '1px solid var(--glass-border)',
            }}
          >
            <span style={{ color, flexShrink: 0 }}>•</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function sectionTitleStyle(color: string) {
  return {
    fontSize: 11,
    color,
    fontWeight: 700,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  }
}

const heroCardStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: 14,
  borderRadius: 22,
  background: 'var(--panel)',
  border: '1px solid var(--glass-border)',
  backdropFilter: 'blur(18px) saturate(1.18)',
  boxShadow: 'var(--glass-shadow-soft)',
}

const primaryButtonStyle = {
  background: 'var(--button-grad)',
  border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 999,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  padding: '9px 14px',
  cursor: 'pointer',
  flexShrink: 0,
  boxShadow: '0 14px 30px rgba(49,102,255,0.22)',
}

const loadingButtonStyle = {
  ...primaryButtonStyle,
  background: 'var(--glass-button)',
  color: 'var(--muted)',
  border: '1px solid var(--glass-border)',
  boxShadow: 'none',
  cursor: 'not-allowed',
}

const errorStyle = {
  background: 'var(--danger-bg)',
  border: '1px solid var(--danger-border)',
  borderRadius: 16,
  padding: '10px 12px',
  fontSize: 12,
  color: 'var(--danger)',
}

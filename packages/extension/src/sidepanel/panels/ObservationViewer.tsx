import { useMemo, useState } from 'react'
import type { PageObservation } from '@browser-automation/shared'

interface Props {
  observation: PageObservation | null
  onRefresh: (mode?: 'task' | 'observe', behavior?: { quietOnFailure?: boolean }) => Promise<PageObservation | null>
  loading?: boolean
}

export function ObservationViewer({ observation, onRefresh, loading }: Props) {
  const [expandedSection, setExpandedSection] = useState<string | null>('snapshot')

  const actionableCount = useMemo(
    () => observation?.elements?.filter((element) => element.actionable).length ?? 0,
    [observation]
  )
  const snapshot = observation?.snapshot

  const toggle = (key: string) => setExpandedSection((prev) => (prev === key ? null : key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={heroStyle}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Observe</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.5 }}>
            Compact snapshot of the current page with stable refs for planning and execution.
          </div>
        </div>
        <button onClick={() => void onRefresh()} disabled={loading} style={loading ? loadingButtonStyle : buttonStyle}>
          {loading ? 'Collecting...' : 'Refresh'}
        </button>
      </div>

      {!observation && !loading && (
        <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: '24px 0' }}>
          Refresh the active tab to collect a compact observation snapshot.
        </div>
      )}

      {observation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Card title="Page">
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {observation.title || '(no title)'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {observation.url}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Metric value={String(observation.elements?.length ?? 0)} label="elements" />
              <Metric value={String(actionableCount)} label="actionable" />
              <Metric value={String(observation.forms?.length ?? 0)} label="forms" />
              <Metric value={String(observation.textBlocks?.length ?? 0)} label="text blocks" />
            </div>
          </Card>

          {snapshot && (
            <ExpandableSection
              title="Snapshot"
              open={expandedSection === 'snapshot'}
              onToggle={() => toggle('snapshot')}
            >
              <div style={{ fontSize: 12, color: 'var(--text-soft)', lineHeight: 1.6 }}>{snapshot.summary}</div>
              {snapshot.visibleTextSummary && (
                <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.55, marginTop: 8 }}>
                  {snapshot.visibleTextSummary}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {snapshot.mainContentRef && <RefChip label={`Main ${snapshot.mainContentRef}`} />}
                {snapshot.actionableRefs.slice(0, 12).map((ref) => (
                  <RefChip key={ref} label={ref} />
                ))}
              </div>
            </ExpandableSection>
          )}

          {observation.elements && observation.elements.length > 0 && (
            <ExpandableSection
              title={`Elements (${observation.elements.length})`}
              open={expandedSection === 'elements'}
              onToggle={() => toggle('elements')}
            >
              {observation.elements.slice(0, 40).map((element, index) => (
                <Row
                  key={`${element.selector}-${index}`}
                  refLabel={element.ref}
                  title={element.label || element.text || element.selector}
                  subtitle={element.selector}
                  meta={`${element.kind}${element.actionable ? ' • actionable' : ''}`}
                />
              ))}
            </ExpandableSection>
          )}

          {observation.forms && observation.forms.length > 0 && (
            <ExpandableSection
              title={`Forms (${observation.forms.length})`}
              open={expandedSection === 'forms'}
              onToggle={() => toggle('forms')}
            >
              {observation.forms.map((form, formIndex) => (
                <div key={`${form.selector}-${formIndex}`} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 700, marginBottom: 6 }}>
                    {form.ref} • {form.selector}
                  </div>
                  {form.fields.map((field, fieldIndex) => (
                    <Row
                      key={`${field.selector}-${fieldIndex}`}
                      refLabel={field.ref}
                      title={field.label ?? field.name ?? field.selector}
                      subtitle={field.selector}
                      meta={`${field.type}${field.required ? ' • required' : ''}`}
                    />
                  ))}
                </div>
              ))}
            </ExpandableSection>
          )}

          {observation.textBlocks && observation.textBlocks.length > 0 && (
            <ExpandableSection
              title={`Visible Text (${observation.textBlocks.length})`}
              open={expandedSection === 'textBlocks'}
              onToggle={() => toggle('textBlocks')}
            >
              {observation.textBlocks.map((block, index) => (
                <Row
                  key={`${block.selector}-${index}`}
                  refLabel={block.ref}
                  title={block.text}
                  subtitle={block.selector}
                  meta={block.region}
                />
              ))}
            </ExpandableSection>
          )}

          {observation.links && observation.links.length > 0 && (
            <ExpandableSection
              title={`Links (${observation.links.length})`}
              open={expandedSection === 'links'}
              onToggle={() => toggle('links')}
            >
              {observation.links.map((link, index) => (
                <Row
                  key={`${link.selector}-${index}`}
                  refLabel={link.ref}
                  title={link.text || link.href}
                  subtitle={link.href}
                  meta={link.external ? 'external' : 'local'}
                />
              ))}
            </ExpandableSection>
          )}

          {observation.text && (
            <ExpandableSection
              title="Page Text"
              open={expandedSection === 'pageText'}
              onToggle={() => toggle('pageText')}
            >
              <pre style={preStyle}>{observation.text}</pre>
            </ExpandableSection>
          )}

          <ExpandableSection
            title="Debug JSON"
            open={expandedSection === 'json'}
            onToggle={() => toggle('json')}
          >
            <pre style={preStyle}>{JSON.stringify(observation, null, 2)}</pre>
          </ExpandableSection>
        </div>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, color: '#93c5fd', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        minWidth: 72,
        padding: '8px 10px',
        borderRadius: 14,
        background: 'var(--surface)',
        border: '1px solid var(--glass-border)',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  )
}

function RefChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 9px',
        borderRadius: 999,
        background: 'var(--surface)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-soft)',
        fontSize: 11,
      }}
    >
      {label}
    </span>
  )
}

function Row({
  refLabel,
  title,
  subtitle,
  meta,
}: {
  refLabel: string
  title: string
  subtitle: string
  meta?: string
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr',
        gap: 10,
        padding: '8px 0',
        borderBottom: '1px solid var(--glass-border)',
      }}
    >
      <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700 }}>{refLabel}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
          {subtitle}
        </div>
        {meta && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{meta}</div>}
      </div>
    </div>
  )
}

function ExpandableSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div style={cardStyle}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          color: 'var(--text-soft)',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>{title}</span>
        <span style={{ color: 'var(--muted)' }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

const heroStyle = {
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

const cardStyle = {
  background: 'var(--panel)',
  border: '1px solid var(--glass-border)',
  borderRadius: 20,
  padding: '12px 14px',
  boxShadow: 'var(--glass-shadow-soft)',
  backdropFilter: 'blur(18px) saturate(1.18)',
}

const buttonStyle = {
  background: 'var(--glass-button)',
  border: '1px solid var(--glass-border)',
  borderRadius: 999,
  color: 'var(--text)',
  fontSize: 12,
  fontWeight: 600,
  padding: '9px 14px',
  cursor: 'pointer',
}

const loadingButtonStyle = {
  ...buttonStyle,
  color: 'var(--muted)',
  cursor: 'not-allowed',
}

const preStyle = {
  fontSize: 10,
  color: 'var(--text-soft)',
  margin: 0,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  maxHeight: 260,
  overflow: 'auto',
}

import { useMemo, useState } from 'react'
import type { PageObservation } from '@browser-automation/shared'

interface Props {
  observation: PageObservation | null
  onRefresh: () => void
  loading?: boolean
}

export function ObservationViewer({ observation, onRefresh, loading }: Props) {
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const actionableCount = useMemo(
    () => observation?.elements?.filter((element) => element.actionable).length ?? 0,
    [observation]
  )
  const snapshot = observation?.snapshot

  const toggle = (key: string) => setExpandedSection((prev) => (prev === key ? null : key))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>Page Observation</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Compact page context for planning and assist mode
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: loading ? '#1e1e2e' : '#1e2040',
            border: '1px solid #313150',
            borderRadius: 6,
            color: loading ? '#475569' : '#94a3b8',
            fontSize: 11,
            padding: '5px 10px',
            cursor: loading ? 'not-allowed' : 'pointer',
            flexShrink: 0,
          }}
        >
          {loading ? 'Collecting...' : 'Refresh'}
        </button>
      </div>

      {!observation && !loading && (
        <div style={{ textAlign: 'center', color: '#334155', fontSize: 12, padding: '20px 0' }}>
          Click Refresh to observe the active tab
        </div>
      )}

      {observation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: '#16162a', border: '1px solid #1e1e3a', borderRadius: 8, padding: '9px 11px' }}>
            <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 700, marginBottom: 4 }}>PAGE</div>
            <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {observation.title || '(no title)'}
            </div>
            <div style={{ fontSize: 10, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {observation.url}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 10, color: '#334155', flexWrap: 'wrap' }}>
              <span>{observation.elements?.length ?? 0} elements</span>
              <span>{actionableCount} actionable</span>
              <span>{observation.forms?.length ?? 0} forms</span>
              <span>{observation.textBlocks?.length ?? 0} text blocks</span>
              <span>{snapshot?.elements.length ?? 0} refs</span>
            </div>
          </div>

          {snapshot && (
            <div style={{ background: '#101525', border: '1px solid #1d2943', borderRadius: 8, padding: '9px 11px' }}>
              <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, marginBottom: 4 }}>SNAPSHOT</div>
              <div style={{ fontSize: 11, color: '#cbd5e1' }}>{snapshot.summary}</div>
              {snapshot.visibleTextSummary && (
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 5 }}>{snapshot.visibleTextSummary}</div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, fontSize: 10 }}>
                <span style={{ color: '#94a3b8' }}>Actionable refs: {snapshot.actionableRefs.join(', ') || 'none'}</span>
                {snapshot.mainContentRef && <span style={{ color: '#6366f1' }}>Main ref: {snapshot.mainContentRef}</span>}
              </div>
            </div>
          )}

          {observation.elements && observation.elements.length > 0 && (
            <Section
              title={`Elements (${observation.elements.length})`}
              open={expandedSection === 'elements'}
              onToggle={() => toggle('elements')}
            >
              {observation.elements.slice(0, 40).map((element, index) => (
                <div key={`${element.selector}-${index}`} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 11, color: '#94a3b8', borderBottom: '1px solid #0a0a14' }}>
                  <span style={{ color: '#22c55e', minWidth: 28, fontWeight: 700 }}>
                    {element.ref}
                  </span>
                  <span style={{ color: element.actionable ? '#f59e0b' : '#475569', minWidth: 58, textTransform: 'capitalize' }}>
                    {element.kind}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {element.label || element.text || element.selector}
                    </div>
                    <div style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {element.selector}
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {observation.forms && observation.forms.length > 0 && (
            <Section
              title={`Forms (${observation.forms.length})`}
              open={expandedSection === 'forms'}
              onToggle={() => toggle('forms')}
            >
              {observation.forms.map((form, formIndex) => (
                <div key={`${form.selector}-${formIndex}`} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#6366f1', fontWeight: 600, marginBottom: 4 }}>
                    {form.ref} - {form.selector}
                  </div>
                  {form.fields.map((field, fieldIndex) => (
                    <div key={`${field.selector}-${fieldIndex}`} style={{ display: 'flex', gap: 6, padding: '2px 0', fontSize: 11, color: '#94a3b8' }}>
                      <span style={{ color: '#22c55e', minWidth: 28 }}>{field.ref}</span>
                      <span style={{ color: '#475569', minWidth: 54 }}>{field.type}</span>
                      <span style={{ flex: 1 }}>{field.label ?? field.name ?? field.selector}</span>
                      {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                    </div>
                  ))}
                </div>
              ))}
            </Section>
          )}

          {observation.textBlocks && observation.textBlocks.length > 0 && (
            <Section
              title={`Visible Text (${observation.textBlocks.length})`}
              open={expandedSection === 'textBlocks'}
              onToggle={() => toggle('textBlocks')}
            >
              {observation.textBlocks.map((block, index) => (
                <div key={`${block.selector}-${index}`} style={{ padding: '4px 0', borderBottom: '1px solid #0a0a14' }}>
                  <div style={{ fontSize: 10, color: '#475569', marginBottom: 2 }}>{block.ref} - {block.selector}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{block.text}</div>
                </div>
              ))}
            </Section>
          )}

          {observation.links && observation.links.length > 0 && (
            <Section
              title={`Links (${observation.links.length})`}
              open={expandedSection === 'links'}
              onToggle={() => toggle('links')}
            >
              {observation.links.map((link, index) => (
                <div key={`${link.selector}-${index}`} style={{ padding: '3px 0', fontSize: 11, color: '#94a3b8', borderBottom: '1px solid #0a0a14' }}>
                  <span style={{ color: '#22c55e', minWidth: 28, display: 'inline-block' }}>{link.ref}</span>
                  <span style={{ color: link.external ? '#f59e0b' : '#cbd5e1' }}>
                    {link.text || link.href}
                  </span>
                  <div style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {link.href}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {observation.text && (
            <Section
              title="Page Text"
              open={expandedSection === 'pageText'}
              onToggle={() => toggle('pageText')}
            >
              <pre style={{ fontSize: 10, color: '#475569', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflow: 'auto' }}>
                {observation.text}
              </pre>
            </Section>
          )}

          <Section
            title="Debug JSON"
            open={expandedSection === 'json'}
            onToggle={() => toggle('json')}
          >
            <pre style={{ fontSize: 10, color: '#94a3b8', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto' }}>
              {JSON.stringify(observation, null, 2)}
            </pre>
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({
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
    <div style={{ background: '#16162a', border: '1px solid #1e1e3a', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '8px 11px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          color: '#94a3b8',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <span>{title}</span>
        <span style={{ color: '#334155' }}>{open ? 'v' : '>'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 11px 10px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

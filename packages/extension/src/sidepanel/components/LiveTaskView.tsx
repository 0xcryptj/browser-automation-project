import type { StreamState } from '../hooks/useTaskStream.js'
import {
  ActionIcon,
  CameraIcon,
  DocumentIcon,
  SparkIcon,
  TargetIcon,
} from './icons.js'

interface Props {
  state: StreamState
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  idle: { label: 'Idle', color: '#64748b' },
  submitting: { label: 'Submitting', color: '#60a5fa' },
  planning: { label: 'Planning', color: '#60a5fa' },
  streaming: { label: 'Working', color: '#60a5fa' },
  done: { label: 'Done', color: '#22c55e' },
  failed: { label: 'Failed', color: '#ef4444' },
  cancelled: { label: 'Cancelled', color: '#f59e0b' },
  awaiting_approval: { label: 'Needs approval', color: '#a855f7' },
  error: { label: 'Error', color: '#ef4444' },
}

const STEP_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#64748b' },
  running: { label: 'Running', color: '#60a5fa' },
  done: { label: 'Done', color: '#22c55e' },
  failed: { label: 'Failed', color: '#ef4444' },
  awaiting_approval: { label: 'Approval', color: '#a855f7' },
  skipped: { label: 'Skipped', color: '#94a3b8' },
}

export function LiveTaskView({ state }: Props) {
  const meta = STATUS_META[state.status] ?? STATUS_META.idle
  const doneCount = state.steps.filter((step) => step.status === 'done').length
  const failedCount = state.steps.filter((step) => step.status === 'failed').length
  const activeStep = state.steps.find((step) => step.status === 'running' || step.status === 'awaiting_approval')
  const answer = buildAnswer(state)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 16,
          background: 'var(--panel)',
          border: '1px solid var(--glass-border)',
          borderRadius: 22,
          boxShadow: 'var(--shadow)',
          overflow: 'hidden',
          position: 'relative',
          backdropFilter: 'blur(24px) saturate(1.22)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 auto auto 0',
            width: '100%',
            height: 1,
            background: `linear-gradient(90deg, ${meta.color}, transparent 65%)`,
            opacity: 0.95,
          }}
        />

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: meta.color,
                flexShrink: 0,
              }}
            >
              <SparkIcon />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>Browser Assistant</div>
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--text)',
                  fontWeight: 600,
                  lineHeight: 1.35,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={state.prompt}
              >
                {getAssistantMessage(state)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusPill label={meta.label} color={meta.color} />
            {state.durationMs !== null && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                {(state.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--text-soft)',
            background: 'var(--surface)',
            border: '1px solid var(--glass-border)',
            borderRadius: 16,
            padding: '12px 13px',
            backdropFilter: 'blur(18px)',
          }}
        >
          {state.prompt}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Metric label="Done" value={String(doneCount)} color="#22c55e" />
          <Metric label="Failed" value={String(failedCount)} color="#ef4444" />
          <Metric label="Total" value={String(state.stepCount || state.steps.length)} color="#94a3b8" />
          {activeStep && <Metric label="Active" value={`Step ${activeStep.index + 1}`} color="#60a5fa" />}
        </div>
      </div>

      {(state.status === 'streaming' || state.status === 'planning' || state.status === 'submitting') && state.steps.length === 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
            background: 'var(--panel)',
            border: '1px solid var(--glass-border)',
            borderRadius: 16,
            color: 'var(--text-soft)',
            fontSize: 12,
            backdropFilter: 'blur(20px)',
          }}
        >
          <OrbitDots />
          {state.status === 'planning' ? 'Grounding on the page and building the plan...' : 'Connecting the task to the runner...'}
        </div>
      )}

      {state.status === 'streaming' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '11px 13px',
            background: 'linear-gradient(180deg, rgba(96,165,250,0.08), rgba(59,130,246,0.03))',
            border: '1px solid rgba(96,165,250,0.20)',
            borderRadius: 16,
            color: 'var(--text-soft)',
            fontSize: 12,
            backdropFilter: 'blur(20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <OrbitDots />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeStep
                ? `Working in the browser tab: ${activeStep.description}`
                : 'Working in the browser tab...'}
            </span>
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
            {doneCount}/{state.stepCount || state.steps.length || '?'} done
          </span>
        </div>
      )}

      {state.steps.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {state.steps.map((step) => {
            const stepMeta = STEP_STATUS_META[step.status] ?? STEP_STATUS_META.pending
            const active = step.status === 'running' || step.status === 'awaiting_approval'

            return (
              <div
                key={step.index}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 13px',
                  background: active ? 'var(--panel-soft)' : 'var(--panel)',
                  border: `1px solid ${active ? 'rgba(135,176,255,0.28)' : 'var(--glass-border)'}`,
                  borderRadius: 18,
                  boxShadow: active ? '0 18px 34px rgba(37,99,235,0.12)' : 'var(--glass-shadow-soft)',
                  backdropFilter: 'blur(20px) saturate(1.2)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: active ? 'rgba(37,99,235,0.10)' : 'var(--surface)',
                      border: `1px solid ${active ? 'rgba(37,99,235,0.20)' : 'var(--border)'}`,
                      color: active ? '#60a5fa' : 'var(--muted)',
                    }}
                  >
                    <ActionIcon type={step.actionType} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{step.index + 1}</div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, lineHeight: 1.35 }}>{step.description}</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: stepMeta.color, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {step.status === 'running' ? <OrbitDots compact /> : <StatusDot color={stepMeta.color} />}
                      {stepMeta.label}
                    </div>
                  </div>

                  {(step.targetLabel || step.elementRef || step.selector) && (
                    <div
                      style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 6,
                      padding: '4px 8px',
                      background: 'var(--glass-button)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: 999,
                        fontSize: 11,
                        color: 'var(--muted)',
                        maxWidth: '100%',
                      }}
                    >
                      <TargetIcon />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {step.targetLabel ?? step.elementRef ?? step.selector}
                      </span>
                    </div>
                  )}

                  {step.result && step.status === 'done' && step.actionType !== 'extract' && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-soft)',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {step.result}
                    </div>
                  )}

                  {step.error && (
                    <div
                      style={{
                        marginTop: 4,
                        padding: '8px 9px',
                        background: '#160a0a',
                        border: '1px solid #3a1414',
                        borderRadius: 12,
                        fontSize: 11,
                        color: '#fca5a5',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {step.error}
                    </div>
                  )}

                  {step.status === 'failed' && step.hasScreenshot && (
                    <div
                      style={{
                        marginTop: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 9px',
                        background: 'rgba(96,165,250,0.08)',
                        border: '1px solid rgba(96,165,250,0.18)',
                        borderRadius: 999,
                        fontSize: 11,
                        color: 'var(--muted)',
                      }}
                    >
                      <CameraIcon />
                      Debug screenshot captured
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {answer && (
        <div
          style={{
            padding: 14,
            background: 'var(--panel)',
            border: '1px solid var(--glass-border)',
            borderRadius: 22,
            boxShadow: 'var(--shadow-soft)',
            backdropFilter: 'blur(22px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <DocumentIcon style={{ color: 'var(--muted)' }} />
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>Assistant response</span>
          </div>
          <div
            style={{
              padding: '12px 13px',
              background: 'var(--surface)',
              border: '1px solid var(--glass-border)',
              borderRadius: 16,
              fontSize: 12,
              color: 'var(--text-soft)',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 320,
              overflowY: 'auto',
              backdropFilter: 'blur(18px)',
            }}
          >
            {answer}
          </div>
        </div>
      )}

      {state.error && (
        <div
          style={{
            padding: '12px 13px',
            background: '#160a0a',
            border: '1px solid #3a1414',
            borderRadius: 14,
            fontSize: 12,
            color: '#fca5a5',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {state.error}
        </div>
      )}
    </div>
  )
}

function buildAnswer(state: StreamState) {
  const extracts = state.steps
    .filter((step) => step.status === 'done' && step.actionType === 'extract' && step.result)
    .map((step) => step.result!.trim())
    .filter(Boolean)

  if (extracts.length === 0) return ''
  const unique = Array.from(new Set(extracts))
  return unique.length === 1 ? unique[0] : unique.join('\n\n')
}

function getAssistantMessage(state: StreamState) {
  const activeStep = state.steps.find((step) => step.status === 'running')
  const pendingApproval = state.steps.find((step) => step.status === 'awaiting_approval')

  if (state.status === 'planning') return 'Building a grounded plan for this page'
  if (state.status === 'submitting') return 'Sending your task to the local runner'
  if (state.status === 'awaiting_approval' && pendingApproval) return `Waiting for approval: ${pendingApproval.description}`
  if (activeStep) return activeStep.description
  if (state.status === 'done') return 'Finished working on the task'
  if (state.status === 'failed') return 'The task hit an execution problem'
  if (state.status === 'cancelled') return 'The task was cancelled'
  if (state.status === 'error') return 'The connection needs recovery'
  return 'Ready to read, click, type, and automate'
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 9px',
        borderRadius: 999,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-soft)',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}22` }} />
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 9px',
        borderRadius: 999,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text)',
      }}
    >
      <StatusDot color={color} />
      {label}
    </span>
  )
}

function StatusDot({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
}

function OrbitDots({ compact = false }: { compact?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', gap: compact ? 3 : 4, alignItems: 'center' }}>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          style={{
            width: compact ? 4 : 5,
            height: compact ? 4 : 5,
            borderRadius: '50%',
            background: '#60a5fa',
            animation: `dotPulse 1.2s ease-in-out ${index * 0.18}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

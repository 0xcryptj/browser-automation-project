import { useEffect, useRef, useState } from 'react'
import { ComposeIcon, SendIcon } from './icons.js'

interface Props {
  onSubmit: (prompt: string) => void
  disabled?: boolean
  compact?: boolean
}

export function TaskInput({ onSubmit, disabled, compact = false }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const canSubmit = Boolean(value.trim()) && !disabled

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 0 : 10,
        padding: compact ? 10 : 12,
        background: 'color-mix(in srgb, var(--panel) 88%, transparent)',
        border: '1px solid color-mix(in srgb, var(--glass-border) 88%, transparent)',
        borderRadius: compact ? 22 : 26,
        boxShadow: '0 -1px 0 rgba(255,255,255,0.04) inset, var(--shadow)',
        backdropFilter: 'blur(28px) saturate(1.28)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: compact ? 'center' : 'flex-start',
          gap: 10,
        }}
      >
        {!compact && (
          <button
            type="button"
            style={iconButtonStyle}
            title="Tools coming next"
          >
            <ComposeIcon size={14} />
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={compact ? 'Ask quietly...' : 'Ask anything…'}
          rows={compact ? 1 : 3}
          style={{
            resize: compact ? 'none' : 'vertical',
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontSize: compact ? 13 : 14,
            lineHeight: compact ? 1.45 : 1.6,
            padding: compact ? '8px 0 0' : '4px 0 0',
            width: '100%',
            outline: 'none',
            fontFamily: 'inherit',
            minHeight: compact ? 34 : undefined,
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: compact ? 34 : 38,
            height: compact ? 34 : 38,
            alignSelf: compact ? 'center' : 'flex-end',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: canSubmit ? 'var(--button-grad)' : 'var(--glass-button)',
            color: canSubmit ? '#0f172a' : 'var(--muted)',
            border: `1px solid ${canSubmit ? 'rgba(255,255,255,0.24)' : 'var(--glass-border)'}`,
            borderRadius: '50%',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'all 120ms ease',
            boxShadow: canSubmit ? '0 14px 28px rgba(49,102,255,0.24), inset 0 1px 0 rgba(255,255,255,0.28)' : 'none',
            flexShrink: 0,
            backdropFilter: 'blur(18px)',
          }}
          title={disabled ? 'Task running' : 'Run task'}
        >
          <SendIcon size={14} />
        </button>
      </div>

      {!compact && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 11 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: disabled ? '#f59e0b' : '#22c55e',
                boxShadow: `0 0 0 4px ${disabled ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)'}`,
              }}
            />
            <span>{disabled ? 'Working in the browser' : 'Ready to read, click, type, and automate'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 11 }}>
            <Keycap label="Enter" />
            <span>to run</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Keycap({ label }: { label: string }) {
  return (
    <span style={keycapStyle}>
      {label}
    </span>
  )
}

const iconButtonStyle = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: '1px solid var(--glass-border)',
  background: 'var(--glass-button)',
  color: 'var(--muted)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const keycapStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 34,
  height: 22,
  padding: '0 8px',
  borderRadius: 8,
  background: 'var(--glass-button)',
  border: '1px solid var(--glass-border)',
  color: 'var(--text-soft)',
  fontSize: 10,
  fontWeight: 600,
}

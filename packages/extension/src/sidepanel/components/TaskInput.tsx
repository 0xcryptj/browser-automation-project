import { useEffect, useRef, useState } from 'react'

interface Props {
  onSubmit: (prompt: string) => void
  disabled?: boolean
}

export function TaskInput({ onSubmit, disabled }: Props) {
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
        gap: 10,
        padding: 14,
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #93c5fd, #2563eb 65%, #111827)',
            boxShadow: '0 0 0 5px rgba(59,130,246,0.10)',
            flexShrink: 0,
          }}
        />
        <div style={{ fontSize: 11, color: 'var(--text-soft)', fontWeight: 600 }}>Ask the browser to do something</div>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Tell me about this page, extract the heading, click sign in, or fill the visible form..."
        rows={4}
        style={{
          resize: 'none',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          color: 'var(--text)',
          fontSize: 13,
          lineHeight: 1.55,
          padding: '12px 13px',
          width: '100%',
          outline: 'none',
          fontFamily: 'inherit',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 11 }}>
          <Keycap label="Enter" />
          <span>to run</span>
          <span style={{ color: 'var(--muted)' }}>Shift + Enter for a new line</span>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: canSubmit ? '#f3f4f6' : 'var(--surface)',
            color: canSubmit ? '#0f172a' : 'var(--muted)',
            border: `1px solid ${canSubmit ? '#f8fafc' : 'var(--border)'}`,
            borderRadius: 999,
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            transition: 'all 120ms ease',
            boxShadow: canSubmit ? '0 8px 20px rgba(255,255,255,0.10)' : 'none',
          }}
        >
          <SendIcon />
          {disabled ? 'Running...' : 'Run task'}
        </button>
      </div>
    </div>
  )
}

function Keycap({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 34,
        height: 22,
        padding: '0 8px',
        borderRadius: 8,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        color: 'var(--text-soft)',
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2L7 9" />
      <path d="M14 2L9.5 14 7 9 2 6.5 14 2Z" />
    </svg>
  )
}

import { useEffect, useRef, useState } from 'react'
import { SendIcon } from './icons.js'

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
        alignItems: compact ? 'center' : 'flex-end',
        gap: 8,
        padding: compact ? '6px 8px' : '10px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={compact ? 'Ask...' : 'Ask anything...'}
        rows={compact ? 1 : 2}
        aria-label="Task prompt"
        aria-disabled={disabled}
        style={{
          resize: 'none',
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          fontSize: 13,
          lineHeight: 1.5,
          padding: 0,
          width: '100%',
          outline: 'none',
          fontFamily: 'inherit',
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        aria-label={canSubmit ? 'Run' : 'Enter a task'}
        style={{
          width: 30,
          height: 30,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: canSubmit ? 'var(--button-grad)' : 'var(--glass-button)',
          color: canSubmit ? '#ffffff' : 'var(--muted)',
          border: 'none',
          borderRadius: 8,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          flexShrink: 0,
          opacity: !canSubmit && !disabled ? 0.4 : 1,
          transition: 'opacity 120ms ease',
        }}
        title="Run (Enter)"
      >
        <SendIcon size={12} />
      </button>
    </div>
  )
}


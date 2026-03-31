import { useState, useRef, useEffect } from 'react'

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
        border: '1px solid #1e1e1e',
        background: '#0c0c0c',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Tell me about this page, extract the heading, click sign in..."
        rows={3}
        style={{
          resize: 'none',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid #1a1a1a',
          color: '#d1d5db',
          fontSize: 13,
          lineHeight: 1.55,
          padding: '10px 12px',
          width: '100%',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '6px 8px',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 10, color: '#2d2d2d' }}>⏎ to run</span>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            background: canSubmit ? '#1a1a1a' : 'transparent',
            color: canSubmit ? '#e2e8f0' : '#2d2d2d',
            border: `1px solid ${canSubmit ? '#2d2d2d' : '#141414'}`,
            borderRadius: 2,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 500,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            letterSpacing: '0.01em',
          }}
        >
          {disabled ? 'Running…' : 'Run →'}
        </button>
      </div>
    </div>
  )
}

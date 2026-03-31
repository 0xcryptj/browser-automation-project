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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="What should I do? e.g. Go to google.com and search for TypeScript tutorials"
        rows={3}
        style={{
          resize: 'vertical',
          background: '#1e1e2e',
          border: '1px solid #313150',
          borderRadius: 8,
          color: '#e2e8f0',
          fontSize: 13,
          lineHeight: 1.5,
          padding: '10px 12px',
          width: '100%',
          outline: 'none',
          fontFamily: 'inherit',
          transition: 'border-color 0.15s',
        }}
        onFocus={(e) => (e.target.style.borderColor = '#6366f1')}
        onBlur={(e) => (e.target.style.borderColor = '#313150')}
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || disabled}
        style={{
          background: disabled || !value.trim() ? '#313150' : '#6366f1',
          color: disabled || !value.trim() ? '#64748b' : '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '9px 16px',
          fontSize: 13,
          fontWeight: 600,
          cursor: disabled || !value.trim() ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
          alignSelf: 'flex-end',
        }}
      >
        {disabled ? 'Running…' : 'Run Task ↵'}
      </button>
    </div>
  )
}

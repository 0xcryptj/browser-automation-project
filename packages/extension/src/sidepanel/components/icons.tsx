import type { CSSProperties } from 'react'

type IconProps = {
  size?: number
  style?: CSSProperties
}

function baseProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function SparkIcon({ size = 18, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z" />
      <path d="M19 16.5 20 19l2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z" />
      <path d="M5 15.5 5.8 17l1.7.8-1.7.8L5 20.2l-.8-1.6-1.7-.8 1.7-.8Z" />
    </svg>
  )
}

export function SendIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M3 11.5 20.5 4 14 20l-3.7-5-5.3-3.5Z" />
      <path d="M10.3 15 20.5 4" />
    </svg>
  )
}

export function ComposeIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  )
}

export function TargetIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
    </svg>
  )
}

export function CameraIcon({ size = 14, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M4.5 7h3l1.5-2h6l1.5 2h3A1.5 1.5 0 0 1 21 8.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-8A1.5 1.5 0 0 1 4.5 7Z" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  )
}

export function DocumentIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5v4h4" />
      <path d="M9.5 12h6" />
      <path d="M9.5 16h5" />
    </svg>
  )
}

export function ShieldIcon({ size = 16, style }: IconProps) {
  return (
    <svg {...baseProps(size)} style={style}>
      <path d="M12 3 5.5 5.5v5.2c0 4.2 2.6 7.7 6.5 9.3 3.9-1.6 6.5-5.1 6.5-9.3V5.5Z" />
      <path d="m9.5 12 1.7 1.7 3.3-3.7" />
    </svg>
  )
}

export function ActionIcon({ type, size = 16, style }: { type: string } & IconProps) {
  const props = { ...baseProps(size), style }

  switch (type) {
    case 'goto':
      return <svg {...props}><path d="M4 12h13" /><path d="m13 7 5 5-5 5" /></svg>
    case 'click':
      return <svg {...props}><path d="m7 3 10 9-5 1.2L10 20l-3-17Z" /></svg>
    case 'type':
      return <svg {...props}><path d="M5 6h14" /><path d="M12 6v12" /><path d="M8 18h8" /></svg>
    case 'select':
      return <svg {...props}><rect x="4" y="5" width="16" height="14" rx="3" /><path d="m9 11 3 3 3-3" /></svg>
    case 'scroll':
      return <svg {...props}><path d="M12 4v16" /><path d="m8 8 4-4 4 4" /><path d="m8 16 4 4 4-4" /></svg>
    case 'hover':
      return <svg {...props}><path d="M12 4v7" /><path d="M16 8v3" /><path d="M8 6v5" /><path d="M7 12h10v1a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4Z" /></svg>
    case 'press':
    case 'pressKey':
      return <svg {...props}><rect x="3" y="7" width="18" height="10" rx="3" /><path d="M8 12h8" /></svg>
    case 'wait_for_selector':
    case 'wait_for_text':
      return <svg {...props}><circle cx="12" cy="12" r="7" /><path d="M12 8v4l2.5 1.5" /></svg>
    case 'extract':
      return <DocumentIcon size={size} style={style} />
    case 'screenshot':
      return <CameraIcon size={size} style={style} />
    default:
      return <SparkIcon size={size} style={style} />
  }
}

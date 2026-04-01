import type { CSSProperties } from 'react'

interface Props {
  videoSrc?: string
}

export function FutureLoginScreen({ videoSrc }: Props) {
  return (
    <div
      style={{
        position: 'relative',
        minHeight: 280,
        overflow: 'hidden',
        borderRadius: 28,
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--shadow)',
        background:
          'linear-gradient(180deg, rgba(11,19,35,0.74), rgba(10,14,24,0.48)), radial-gradient(circle at top, rgba(98,146,255,0.24), transparent 48%)',
      }}
    >
      {videoSrc && (
        <video
          autoPlay
          muted
          loop
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.5,
          }}
          src={videoSrc}
        />
      )}

      <div style={overlayStyle} />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: 280,
          padding: 22,
        }}
      >
        <div
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderRadius: 999,
            background: 'var(--glass-button)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text)',
            fontSize: 11,
            fontWeight: 600,
            backdropFilter: 'blur(18px)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#7dd3fc',
              boxShadow: '0 0 0 5px rgba(125,211,252,0.18)',
            }}
          />
          Future welcome screen
        </div>

        <div
          style={{
            maxWidth: 280,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontSize: 28, lineHeight: 1.04, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.05em' }}>
            A cleaner entry point for the operator.
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.65, color: 'rgba(255,255,255,0.82)' }}>
            This preview is ready for your video background. Once you give me the local asset path, I can wire it in directly.
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <button style={primaryGlassButton}>Continue with local runner</button>
            <button style={secondaryGlassButton}>Preview auth flow</button>
          </div>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 30%, rgba(8,10,18,0.14) 100%)',
  backdropFilter: 'blur(24px) saturate(1.2)',
}

const primaryGlassButton: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(133,177,255,0.92), rgba(73,126,255,0.76))',
  border: '1px solid rgba(255,255,255,0.24)',
  color: '#ffffff',
  borderRadius: 999,
  padding: '10px 14px',
  fontSize: 12,
  fontWeight: 600,
  boxShadow: '0 14px 32px rgba(49,102,255,0.24), inset 0 1px 0 rgba(255,255,255,0.3)',
  backdropFilter: 'blur(18px)',
  cursor: 'pointer',
}

const secondaryGlassButton: CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#ffffff',
  borderRadius: 999,
  padding: '10px 14px',
  fontSize: 12,
  fontWeight: 600,
  backdropFilter: 'blur(18px)',
  cursor: 'pointer',
}

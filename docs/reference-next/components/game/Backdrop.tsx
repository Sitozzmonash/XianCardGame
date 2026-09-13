import { cn } from '@/lib/utils'

/** Concentric rune formation — the signature visual of the game. */
export function MagicCircle({
  className,
  tone = 'jade',
  spin = true,
}: {
  className?: string
  tone?: 'jade' | 'gold'
  spin?: boolean
}) {
  const stroke = tone === 'gold' ? '#c9a86a' : '#35a184'
  const soft = tone === 'gold' ? 'rgba(201,168,106,0.35)' : 'rgba(53,161,132,0.35)'

  return (
    <div className={cn('pointer-events-none absolute', className)} aria-hidden="true">
      <svg viewBox="0 0 400 400" className="h-full w-full">
        <defs>
          <radialGradient id={`mc-core-${tone}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.55" />
            <stop offset="45%" stopColor={stroke} stopOpacity="0.12" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="200" cy="200" r="190" fill={`url(#mc-core-${tone})`} />

        <g className={spin ? 'animate-spin-slow' : undefined} style={{ transformOrigin: '200px 200px' }}>
          <circle cx="200" cy="200" r="186" fill="none" stroke={soft} strokeWidth="1" />
          <circle
            cx="200"
            cy="200"
            r="176"
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
            strokeDasharray="2 10"
            strokeOpacity="0.7"
          />
          <circle cx="200" cy="200" r="150" fill="none" stroke={soft} strokeWidth="1" />
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i / 24) * Math.PI * 2
            const x1 = 200 + Math.cos(angle) * 150
            const y1 = 200 + Math.sin(angle) * 150
            const x2 = 200 + Math.cos(angle) * 168
            const y2 = 200 + Math.sin(angle) * 168
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeOpacity="0.5" strokeWidth="1" />
          })}
        </g>

        <g className={spin ? 'animate-spin-slower' : undefined} style={{ transformOrigin: '200px 200px' }}>
          <circle cx="200" cy="200" r="128" fill="none" stroke={stroke} strokeWidth="1" strokeOpacity="0.55" />
          <circle
            cx="200"
            cy="200"
            r="112"
            fill="none"
            stroke={stroke}
            strokeWidth="1"
            strokeDasharray="14 8"
            strokeOpacity="0.45"
          />
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2
            const x1 = 200 + Math.cos(angle) * 112
            const y1 = 200 + Math.sin(angle) * 112
            const x2 = 200 + Math.cos(angle) * 128
            const y2 = 200 + Math.sin(angle) * 128
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeOpacity="0.6" strokeWidth="1.5" />
          })}
        </g>

        <circle cx="200" cy="200" r="86" fill="none" stroke={stroke} strokeWidth="1" strokeOpacity="0.4" />
        <circle cx="200" cy="200" r="60" fill="none" stroke={stroke} strokeWidth="1" strokeOpacity="0.3" />
      </svg>
    </div>
  )
}

/** Layered mountain silhouettes drawn as a single SVG path set. */
export function MountainRange({ className, opacity = 1 }: { className?: string; opacity?: number }) {
  return (
    <svg
      viewBox="0 0 430 200"
      preserveAspectRatio="none"
      className={cn('pointer-events-none absolute bottom-0 left-0 w-full', className)}
      style={{ opacity }}
      aria-hidden="true"
    >
      <path
        d="M0 200 L0 120 L38 74 L70 108 L104 52 L142 100 L176 66 L214 112 L252 58 L292 104 L326 78 L364 116 L400 84 L430 122 L430 200 Z"
        fill="#0a1e1b"
      />
      <path
        d="M0 200 L0 152 L44 116 L82 146 L120 104 L160 142 L200 112 L244 150 L286 118 L330 152 L372 124 L430 158 L430 200 Z"
        fill="#071614"
      />
    </svg>
  )
}

/** Soft drifting cloud banks. */
export function CloudLayer({ className }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden="true">
      <div className="animate-drift absolute -left-1/4 top-1/4 h-40 w-[150%] rounded-full bg-jade-500/10 blur-3xl" />
      <div className="animate-drift-slow absolute -right-1/4 top-1/2 h-32 w-[140%] rounded-full bg-gold-500/8 blur-3xl" />
      <div className="animate-drift absolute bottom-1/4 left-0 h-36 w-[130%] rounded-full bg-jade-400/8 blur-3xl" />
    </div>
  )
}

export type BackdropVariant = 'home' | 'plain'

/**
 * Full-bleed atmospheric background shared by every screen so the whole game
 * reads as one world.
 */
export function GameBackdrop({ variant = 'plain' }: { variant?: BackdropVariant }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,#0f3d30_0%,#071614_45%,#040d0c_100%)]" />

      {variant === 'home' && (
        <>
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold-300/25 blur-2xl" />
          <div className="absolute right-6 top-6 h-32 w-32 rounded-full bg-gold-300/40 blur-xl" />
        </>
      )}

      <CloudLayer />
      <MountainRange opacity={variant === 'plain' ? 0.5 : 0.85} />
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-transparent to-ink-950/80" />
    </div>
  )
}

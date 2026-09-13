'use client'

import { cn } from '@/lib/utils'

const AVATAR_TONES = [
  'from-jade-600 to-ink-800',
  'from-gold-600 to-ink-800',
  'from-jade-500 to-jade-800',
  'from-[#3a5f7a] to-ink-800',
  'from-[#6b4a7a] to-ink-800',
  'from-[#7a5a3a] to-ink-800',
]

export function PlayerAvatar({
  name,
  size = 'md',
  seat = 0,
  alive = true,
  className,
}: {
  name: string
  size?: 'sm' | 'md' | 'lg'
  seat?: number
  alive?: boolean
  className?: string
}) {
  const dims = {
    sm: 'h-9 w-9 text-sm',
    md: 'h-12 w-12 text-lg',
    lg: 'h-20 w-20 text-3xl',
  }
  const initial = name.replace(/^我$/, '我').slice(0, 1)

  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full border border-gold-500/50 bg-gradient-to-br font-serif font-bold text-cream',
          AVATAR_TONES[seat % AVATAR_TONES.length],
          dims[size],
          !alive && 'opacity-50 saturate-0',
        )}
      >
        {initial}
      </div>
      <span className="absolute -inset-0.5 rounded-full ring-1 ring-inset ring-gold-300/20" />
    </div>
  )
}

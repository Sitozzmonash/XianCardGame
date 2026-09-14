'use client'

import { cn } from '@/lib/utils'
import type { GameCardData } from '@/lib/game-data'

export type GameCardSize = 'sm' | 'md' | 'lg'

const SIZE_CLASS: Record<GameCardSize, string> = {
  sm: 'w-[70px] rounded-xl',
  md: 'w-full rounded-2xl',
  lg: 'w-[248px] rounded-3xl',
}

const NAME_CLASS: Record<GameCardSize, string> = {
  sm: 'text-xs tracking-normal',
  md: 'text-[13px] tracking-[0.1em]',
  lg: 'text-lg tracking-[0.14em]',
}

export function GameCard({
  card,
  size = 'md',
  selected,
  dimmed,
  index,
  onClick,
  className,
}: {
  card: GameCardData
  size?: GameCardSize
  selected?: boolean
  dimmed?: boolean
  index?: number
  onClick?: () => void
  className?: string
}) {
  const interactive = Boolean(onClick)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={`${card.name} · ${card.subtitle}`}
      className={cn(
        'group relative aspect-[3/4] shrink-0 overflow-hidden border text-left',
        'bg-ink-900 transition-all duration-200',
        SIZE_CLASS[size],
        selected
          ? 'border-gold-300 shadow-[0_0_0_1px_rgba(232,213,168,0.6),0_14px_30px_-14px_rgba(201,168,106,0.8)] -translate-y-1'
          : 'border-gold-500/40 shadow-[0_10px_24px_-16px_rgba(0,0,0,0.95)]',
        interactive && 'hover:-translate-y-1 hover:border-gold-400/80',
        dimmed && 'opacity-45 saturate-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.art || '/placeholder.svg'}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/25 to-transparent" />
      <div className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-gold-300/15" />

      {typeof index === 'number' && (
        <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md border border-gold-400/60 bg-ink-950/80 font-sans text-xs font-semibold text-gold-300">
          {index}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-6">
        <p className={cn('truncate font-serif font-semibold text-cream text-glow-gold', NAME_CLASS[size])}>
          {card.name}
        </p>
        {size !== 'sm' && (
          <p className="mt-0.5 truncate font-sans text-xs tracking-wide text-jade-300/80">{card.subtitle}</p>
        )}
      </div>
    </button>
  )
}

/** Face-down card back used for deck piles and hidden hands. */
export function CardBack({ className, size = 'md' }: { className?: string; size?: GameCardSize }) {
  return (
    <div
      className={cn(
        'relative aspect-[3/4] shrink-0 overflow-hidden border border-gold-500/40 bg-ink-900',
        SIZE_CLASS[size],
        className,
      )}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_40%,#14503f_0%,#071614_75%)]" />
      <div className="absolute inset-1.5 rounded-[inherit] border border-gold-500/25" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-gold-400/50 bg-ink-950/60">
          <span className="font-serif text-sm font-bold text-gold-300">劫</span>
        </div>
      </div>
    </div>
  )
}

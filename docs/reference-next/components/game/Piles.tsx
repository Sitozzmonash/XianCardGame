'use client'

import { cn } from '@/lib/utils'
import { CardBack } from './GameCard'

export function DeckPile({
  count,
  label = '牌堆',
  onClick,
  className,
}: {
  count: number
  label?: string
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn('group flex flex-col items-center gap-1.5', className)}
      aria-label={`${label}，剩余 ${count} 张`}
    >
      <div className="relative">
        <CardBack size="sm" className="absolute left-1 top-1 opacity-40" />
        <CardBack size="sm" className="absolute left-0.5 top-0.5 opacity-70" />
        <CardBack size="sm" className="relative transition-transform duration-200 group-hover:-translate-y-0.5" />
      </div>
      <span className="font-sans text-[10px] tracking-wider text-cream-faint">
        {label} <span className="text-gold-300">({count})</span>
      </span>
    </button>
  )
}

export function DiscardPile({
  count,
  label = '弃牌堆',
  topCardArt,
  onClick,
  className,
}: {
  count: number
  label?: string
  topCardArt?: string
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn('group flex flex-col items-center gap-1.5', className)}
      aria-label={`${label}，共 ${count} 张`}
    >
      <div className="relative aspect-[3/4] w-[70px] overflow-hidden rounded-xl border border-gold-500/40 bg-ink-900">
        {topCardArt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={topCardArt} alt="" className="h-full w-full object-cover opacity-80" />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(80%_60%_at_50%_40%,#103029_0%,#071614_75%)]" />
        )}
        <div className="absolute inset-0 bg-ink-950/40" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-serif text-2xl font-bold text-cream/70">{count}</span>
        </div>
      </div>
      <span className="font-sans text-[10px] tracking-wider text-cream-faint">{label}</span>
    </button>
  )
}

'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  fullWidth?: boolean
}

export function PrimaryButton({ children, className, fullWidth, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'group relative inline-flex items-center justify-center overflow-hidden rounded-2xl px-6 py-3.5',
        'font-serif text-lg font-semibold tracking-[0.18em] text-[#f2fbf6]',
        'border border-gold-500/60',
        'bg-[linear-gradient(180deg,#2f9d7e_0%,#1b6b55_55%,#14503f_100%)]',
        'shadow-[0_10px_28px_-12px_rgba(36,138,110,0.9),inset_0_1px_0_rgba(232,213,168,0.35)]',
        'transition-all duration-200 hover:brightness-110 active:scale-[0.985]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100',
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-gold-300/70 to-transparent" />
      <span className="relative">{children}</span>
    </button>
  )
}

export function SecondaryButton({ children, className, fullWidth, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-2xl px-6 py-3.5',
        'font-serif text-lg font-medium tracking-[0.18em] text-cream',
        'border border-gold-500/45 bg-ink-850/70 backdrop-blur-sm',
        'shadow-[inset_0_1px_0_rgba(232,213,168,0.12)]',
        'transition-all duration-200 hover:border-gold-400/80 hover:bg-ink-800/80 active:scale-[0.985]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60',
        'disabled:cursor-not-allowed disabled:opacity-45',
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function StatusTag({
  children,
  tone = 'jade',
  className,
}: {
  children: ReactNode
  tone?: 'jade' | 'gold' | 'blood' | 'muted'
  className?: string
}) {
  const tones = {
    jade: 'border-jade-400/50 bg-jade-600/25 text-jade-300',
    gold: 'border-gold-500/50 bg-gold-600/15 text-gold-300',
    blood: 'border-blood-500/60 bg-blood-700/30 text-[#e8a9a9]',
    muted: 'border-cream-faint/30 bg-ink-800/60 text-cream-dim',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function SectionTitle({
  children,
  className,
  action,
}: {
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h2 className="font-serif text-[15px] font-semibold tracking-[0.14em] text-gold-300">{children}</h2>
      {action}
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('panel rounded-2xl p-4', className)}>{children}</div>
}

export function SegmentedSelector<T extends string | number>({
  options,
  value,
  onChange,
  formatLabel,
  className,
  size = 'md',
}: {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  formatLabel?: (value: T) => string
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="radiogroup">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-full border font-serif tracking-wider transition-all duration-200',
              size === 'sm' ? 'px-3.5 py-1.5 text-[13px]' : 'px-4 py-2 text-sm',
              active
                ? 'border-gold-400/70 bg-[linear-gradient(180deg,#2f9d7e_0%,#1b6b55_100%)] text-[#f2fbf6] shadow-[0_6px_18px_-10px_rgba(36,138,110,0.95)]'
                : 'border-gold-500/35 bg-ink-850/60 text-cream-dim hover:border-gold-400/60 hover:text-cream',
            )}
          >
            {formatLabel ? formatLabel(option) : String(option)}
          </button>
        )
      })}
    </div>
  )
}

export function AISelector({
  value,
  onChange,
  options,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} role="radiogroup">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-lg border px-2.5 py-1 font-sans text-xs font-medium tracking-wide transition-all duration-200',
              active
                ? 'border-gold-400/70 bg-jade-600/40 text-gold-300'
                : 'border-gold-500/25 bg-ink-900/60 text-cream-faint hover:border-gold-400/50 hover:text-cream-dim',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

export function TopBar({
  eyebrow,
  title,
  onBack,
  right,
  className,
}: {
  eyebrow?: string
  title: string
  onBack?: () => void
  right?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('relative z-10 px-5 pt-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-sans text-xs font-medium tracking-[0.2em] text-jade-300/80">{eyebrow}</p>
          )}
          <h1 className="mt-1 font-serif text-[30px] font-bold leading-tight tracking-[0.06em] text-cream text-glow-gold">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          {right}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="返回"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-500/40 bg-ink-850/70 text-cream-dim transition-colors hover:border-gold-400/70 hover:text-cream"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="gold-hairline mt-3 h-px w-full" />
    </header>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full border border-gold-500/40 bg-ink-850/70 text-cream-dim',
        'transition-colors hover:border-gold-400/70 hover:text-cream',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60',
        className,
      )}
    >
      {children}
    </button>
  )
}

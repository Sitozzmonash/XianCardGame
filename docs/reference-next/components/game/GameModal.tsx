'use client'

import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function GameModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  tone = 'jade',
  className,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  tone?: 'jade' | 'blood'
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
      />
      <div
        className={cn(
          'animate-rise relative z-10 w-full max-w-[400px] overflow-hidden rounded-t-3xl border p-5 sm:rounded-3xl',
          tone === 'blood'
            ? 'border-blood-500/50 bg-[linear-gradient(180deg,rgba(94,31,31,0.55)_0%,rgba(7,22,20,0.97)_60%)]'
            : 'border-gold-500/40 bg-[linear-gradient(180deg,rgba(20,80,63,0.5)_0%,rgba(7,22,20,0.97)_60%)]',
          'shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.95)]',
          className,
        )}
      >
        <div className="gold-hairline absolute inset-x-0 top-0 h-px" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              className={cn(
                'font-serif text-xl font-bold tracking-[0.12em]',
                tone === 'blood' ? 'text-[#e8b0a0] text-glow-gold' : 'text-gold-300 text-glow-gold',
              )}
            >
              {title}
            </h2>
            {subtitle && <p className="mt-1 font-sans text-xs leading-relaxed text-cream-dim">{subtitle}</p>}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold-500/35 text-cream-faint transition-colors hover:border-gold-400/70 hover:text-cream"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        <div className="max-h-[52vh] overflow-y-auto scrollbar-none">{children}</div>

        {footer && <div className="mt-5 flex gap-3">{footer}</div>}
      </div>
    </div>
  )
}

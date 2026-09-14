'use client'

import { cn } from '@/lib/utils'
import { AI_LABEL, AI_OPTIONS, type AIKind, type Seat } from '@/lib/game-data'
import { PlayerAvatar } from './PlayerAvatar'
import { AISelector, StatusTag } from './primitives'

/** A single seat row: avatar, identity, and either a fixed tag or an AI picker. */
export function PlayerPanel({
  seat,
  onKindChange,
  className,
}: {
  seat: Seat
  onKindChange?: (kind: AIKind) => void
  className?: string
}) {
  const isSelf = seat.kind === 'human'

  return (
    <div
      className={cn(
        'rounded-2xl border px-3.5 py-3 transition-colors',
        isSelf ? 'border-gold-500/45 bg-jade-800/25' : 'border-gold-500/25 bg-ink-850/60',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <PlayerAvatar name={seat.name} seat={seat.seat} size="md" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[15px] font-semibold tracking-wide text-cream">{seat.name}</p>
          <p className="mt-0.5 truncate font-sans text-xs tracking-wide text-cream-faint">{seat.title}</p>
        </div>

        {isSelf && (
          <StatusTag tone="gold" className="shrink-0 px-3 py-1 text-xs">
            {AI_LABEL.human}
          </StatusTag>
        )}
      </div>

      {!isSelf && (
        <AISelector
          className="mt-3"
          value={AI_LABEL[seat.kind]}
          options={AI_OPTIONS.map((kind) => AI_LABEL[kind])}
          onChange={(label) => {
            const kind = (Object.keys(AI_LABEL) as AIKind[]).find((key) => AI_LABEL[key] === label)
            if (kind) onKindChange?.(kind)
          }}
        />
      )}
    </div>
  )
}

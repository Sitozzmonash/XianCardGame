'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { GameModal } from '@/components/game/GameModal'
import { PlayerAvatar } from '@/components/game/PlayerAvatar'
import { PrimaryButton, SecondaryButton, StatusTag } from '@/components/game/primitives'
import type { Seat } from '@/lib/game-data'

export function TargetSelectModal({
  open,
  seats,
  onConfirm,
  onClose,
}: {
  open: boolean
  seats: Seat[]
  onConfirm: (seatId: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const targets = seats.filter((seat) => !seat.isSelf && seat.alive)

  return (
    <GameModal
      open={open}
      title="选择目标"
      subtitle="摄物术 · 选择一名存活修士，随机夺取其一张手牌"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton fullWidth onClick={onClose}>
            取消
          </SecondaryButton>
          <PrimaryButton fullWidth disabled={!selected} onClick={() => selected && onConfirm(selected)}>
            确认目标
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-2.5">
        {targets.map((seat) => {
          const active = selected === seat.id
          return (
            <button
              key={seat.id}
              type="button"
              onClick={() => setSelected(seat.id)}
              aria-pressed={active}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all',
                active
                  ? 'border-gold-300 bg-jade-700/40 shadow-[0_0_0_1px_rgba(232,213,168,0.5)]'
                  : 'border-gold-500/25 bg-ink-850/60 hover:border-gold-400/60',
              )}
            >
              <PlayerAvatar name={seat.name} seat={seat.seat} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-[15px] font-semibold text-cream">{seat.name}</p>
                <p className="mt-0.5 font-sans text-[11px] text-cream-faint">手牌 {seat.handCount} 张</p>
              </div>
              {active ? <StatusTag tone="gold">已选中</StatusTag> : <StatusTag tone="muted">存活</StatusTag>}
            </button>
          )
        })}
      </div>
    </GameModal>
  )
}

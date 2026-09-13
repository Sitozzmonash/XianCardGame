'use client'

import { GameModal } from '@/components/game/GameModal'
import { GameCard } from '@/components/game/GameCard'
import { PrimaryButton, SecondaryButton } from '@/components/game/primitives'
import { CARD_BY_ID } from '@/lib/game-data'

export function CounterModal({
  open,
  casterName,
  onUse,
  onDecline,
}: {
  open: boolean
  casterName: string
  onUse: () => void
  onDecline: () => void
}) {
  return (
    <GameModal
      open={open}
      tone="blood"
      title="是否反制"
      subtitle={`「${casterName} 对你使用了摄物术」`}
      onClose={onDecline}
      footer={
        <>
          <SecondaryButton fullWidth onClick={onDecline}>
            不反制
          </SecondaryButton>
          <PrimaryButton fullWidth onClick={onUse}>
            使用反制符
          </PrimaryButton>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3 py-1">
        <div className="relative">
          <div className="absolute -inset-5 rounded-full bg-blood-500/25 blur-2xl" />
          <GameCard card={CARD_BY_ID.fanzhifu} size="lg" className="relative w-[190px]" />
        </div>
        <p className="max-w-[280px] text-center font-sans text-[12px] leading-relaxed text-cream-dim">
          反制符将令该法术效果转向施术者。此牌使用后进入弃牌堆。
        </p>
      </div>
    </GameModal>
  )
}

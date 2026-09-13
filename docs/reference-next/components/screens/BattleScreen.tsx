'use client'

import { GameBackdrop, MagicCircle } from '@/components/game/Backdrop'
import { GameCard } from '@/components/game/GameCard'
import { DiscardPile, DeckPile } from '@/components/game/Piles'
import { PlayerAvatar } from '@/components/game/PlayerAvatar'
import { SecondaryButton, StatusTag } from '@/components/game/primitives'
import { CARD_BY_ID, HAND_CARD_IDS, SELF_NAME, type CardId, type Seat } from '@/lib/game-data'

export function BattleScreen({
  seats,
  round,
  onCardClick,
  onEndTurn,
  onSurrender,
}: {
  seats: Seat[]
  round: number
  onCardClick: (cardId: CardId) => void
  onEndTurn: () => void
  onSurrender: () => void
}) {
  const opponents = seats.filter((seat) => !seat.isSelf)
  const self = seats.find((seat) => seat.isSelf) ?? seats[0]

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <GameBackdrop variant="plain" />

      {/* Round banner */}
      <div className="relative z-10 flex justify-center pt-5">
        <div className="rounded-full border border-gold-500/50 bg-ink-950/80 px-5 py-1.5 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.9)]">
          <span className="font-serif text-[13px] font-semibold tracking-[0.16em] text-gold-300">
            第 {round} 轮（回合对决）
          </span>
        </div>
      </div>

      {/* Opponents */}
      <div className="relative z-10 mt-4 flex gap-2.5 overflow-x-auto scrollbar-none px-4">
        {opponents.map((seat) => (
          <div
            key={seat.id}
            className="flex w-[104px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-gold-500/25 bg-ink-950/60 px-2 py-2.5 backdrop-blur-sm"
          >
            <PlayerAvatar name={seat.name} seat={seat.seat} size="sm" alive={seat.alive} />
            <p className="w-full truncate text-center font-serif text-[11px] font-medium text-cream">{seat.name}</p>
            <StatusTag tone={seat.alive ? 'jade' : 'muted'} className="px-2 py-0 text-[10px]">
              手牌 {seat.handCount} 张
            </StatusTag>
          </div>
        ))}
      </div>

      {/* Battlefield — the great formation anchors the centre of the board. */}
      <div className="relative z-10 flex-1">
        <MagicCircle className="left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2" />

        <div className="absolute left-4 top-3">
          <DeckPile count={28} />
        </div>
        <div className="absolute right-4 top-3">
          <DiscardPile count={5} topCardArt={CARD_BY_ID.tianjie.art} />
        </div>

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <span className="font-serif text-xl font-bold tracking-[0.2em] text-gold-300 text-glow-gold">行动阶段</span>
          <span className="mt-1.5 font-sans text-[10px] tracking-wider text-cream-dim">可使用卡牌或结束回合</span>
        </div>
      </div>

      {/* Self status */}
      <div className="relative z-10 mx-4 flex items-center gap-3 rounded-2xl border border-gold-500/35 bg-ink-950/70 px-3.5 py-2.5 backdrop-blur-sm">
        <PlayerAvatar name={self.name} seat={self.seat} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-sm font-semibold text-cream">
            我（{SELF_NAME}）
          </p>
          <p className="font-sans text-[10px] tracking-wide text-cream-faint">手牌 {HAND_CARD_IDS.length} 张</p>
        </div>
        <StatusTag tone="gold">仙途</StatusTag>
      </div>

      {/* Hand */}
      <div className="relative z-10 mt-3 flex gap-2.5 overflow-x-auto scrollbar-none px-4 pb-1">
        {HAND_CARD_IDS.map((cardId, index) => (
          <GameCard
            key={cardId}
            card={CARD_BY_ID[cardId]}
            size="sm"
            index={index + 1}
            onClick={() => onCardClick(cardId)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="relative z-10 mt-3 grid grid-cols-2 gap-3 border-t border-gold-500/15 bg-ink-950/70 px-4 py-4 backdrop-blur-sm">
        <SecondaryButton onClick={onSurrender} className="py-3 text-base">
          认输
        </SecondaryButton>
        <button
          type="button"
          onClick={onEndTurn}
          className="inline-flex items-center justify-center rounded-2xl border border-gold-500/60 bg-[linear-gradient(180deg,#d8bd85_0%,#c9a86a_55%,#a8874a_100%)] px-6 py-3 font-serif text-base font-semibold tracking-[0.18em] text-ink-950 shadow-[0_10px_26px_-14px_rgba(201,168,106,0.95)] transition-all hover:brightness-110 active:scale-[0.985]"
        >
          结束回合
        </button>
      </div>
    </div>
  )
}

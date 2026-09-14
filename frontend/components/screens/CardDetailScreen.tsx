'use client'

import { GameBackdrop } from '@/components/game/Backdrop'
import { GameCard } from '@/components/game/GameCard'
import { Panel, PrimaryButton, SecondaryButton, SectionTitle, StatusTag, TopBar } from '@/components/game/primitives'
import { CARDS, CARD_CATEGORY_LABEL, type CardId } from '@/lib/game-data'

export function CardDetailScreen({
  cardId,
  onBack,
  onUse,
  onSelectCard,
}: {
  cardId: CardId
  onBack: () => void
  onUse: (cardId: CardId) => void
  onSelectCard: (cardId: CardId) => void
}) {
  const card = CARDS.find((item) => item.id === cardId) ?? CARDS[0]
  const related = CARDS.filter((item) => item.id !== card.id).slice(0, 4)

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <GameBackdrop variant="plain" />

      <TopBar eyebrow="卡牌玄妙" title={card.name} onBack={onBack} />

      <div className="relative z-10 flex-1 space-y-5 overflow-y-auto scrollbar-none px-5 pb-6 pt-5">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute -inset-6 rounded-full bg-jade-500/15 blur-2xl" />
            <GameCard card={card} size="lg" className="relative" />
          </div>
        </div>

        <div className="flex items-center justify-center gap-2">
          <StatusTag tone="jade">{CARD_CATEGORY_LABEL[card.category]}</StatusTag>
          <StatusTag tone="gold">{card.subtitle}</StatusTag>
          <StatusTag tone="muted">{card.rarity}</StatusTag>
        </div>

        <Panel className="space-y-3">
          <SectionTitle>卡牌效果</SectionTitle>
          <p className="font-sans text-[13px] leading-relaxed text-cream">{card.effect}</p>
          <div className="gold-hairline h-px w-full opacity-60" />
          <p className="font-serif text-[12px] italic leading-relaxed text-cream-faint">{card.flavor}</p>
        </Panel>

        <section className="space-y-3">
          <SectionTitle>相关对局卡牌</SectionTitle>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1">
            {related.map((item) => (
              <GameCard key={item.id} card={item} size="sm" onClick={() => onSelectCard(item.id)} />
            ))}
          </div>
        </section>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-3 border-t border-gold-500/15 bg-ink-950/70 px-5 py-4 backdrop-blur-sm">
        <SecondaryButton onClick={onBack}>取消</SecondaryButton>
        <PrimaryButton onClick={() => onUse(card.id)}>使用卡牌</PrimaryButton>
      </div>
    </div>
  )
}

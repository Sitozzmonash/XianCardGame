'use client'

import { useState } from 'react'
import { GameBackdrop } from '@/components/game/Backdrop'
import { GameCard } from '@/components/game/GameCard'
import { SegmentedSelector, TopBar } from '@/components/game/primitives'
import { CARDS, CARD_CATEGORY_LABEL, type CardCategory, type CardId } from '@/lib/game-data'

type Filter = 'all' | CardCategory

const FILTERS: Filter[] = ['all', 'active', 'defense', 'tribulation']

export function CollectionScreen({
  onBack,
  onSelectCard,
}: {
  onBack: () => void
  onSelectCard: (cardId: CardId) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = filter === 'all' ? CARDS : CARDS.filter((card) => card.category === filter)

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <GameBackdrop variant="plain" />

      <TopBar eyebrow="藏经阁" title="卡牌图鉴" onBack={onBack} />

      <div className="relative z-10 px-5 pt-4">
        <SegmentedSelector
          size="sm"
          options={FILTERS}
          value={filter}
          onChange={setFilter}
          formatLabel={(value) => (value === 'all' ? '全部' : CARD_CATEGORY_LABEL[value])}
        />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto scrollbar-none px-5 pb-6 pt-4">
        <div className="grid grid-cols-2 gap-3.5">
          {visible.map((card) => (
            <GameCard key={card.id} card={card} size="md" onClick={() => onSelectCard(card.id)} />
          ))}
        </div>
        <p className="mt-5 text-center font-sans text-[10px] tracking-[0.2em] text-cream-faint">
          共 {visible.length} 张 · 天命既定，亦可改之
        </p>
      </div>
    </div>
  )
}

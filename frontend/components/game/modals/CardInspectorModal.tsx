'use client'

import { GameModal } from '@/components/game/GameModal'
import { PrimaryButton, StatusTag } from '@/components/game/primitives'
import { CARD_CATEGORY_LABEL, type GameCardData } from '@/lib/game-data'
import type { LegalAction } from '@/types/game'

function usageHint(action?: LegalAction) {
  if (!action) return '当前阶段不能使用此牌；你仍可随时查看它的完整效果。'
  if (action.params?.target_player) return '此牌可在当前时机使用，使用后需要选择一名符合条件的目标。'
  if (action.type === 'COUNTER') return '这是反应牌：只有在反应阶段出现时才能使用。'
  return '此牌可在当前时机直接使用。'
}

export function CardInspectorModal({
  open,
  card,
  action,
  onClose,
}: {
  open: boolean
  card?: GameCardData
  action?: LegalAction
  onClose: () => void
}) {
  if (!card) return null

  return (
    <GameModal
      open={open}
      title={`【${card.name}】`}
      subtitle={`${CARD_CATEGORY_LABEL[card.category]}牌 · ${card.subtitle}`}
      onClose={onClose}
      tone={card.category === 'tribulation' ? 'blood' : 'jade'}
      footer={<PrimaryButton fullWidth onClick={onClose}>我知道了</PrimaryButton>}
    >
      <div className="card-inspector">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.art} alt={`${card.name} 卡牌插画`} />
        <div className="card-inspector-copy">
          <StatusTag tone={action ? 'jade' : 'muted'}>{action ? '当前可使用' : '当前不可使用'}</StatusTag>
          <p className="card-inspector-label">卡牌作用</p>
          <strong>{card.effect}</strong>
          <p className="card-inspector-usage">{usageHint(action)}</p>
          <p className="card-inspector-flavor">{card.flavor}</p>
        </div>
      </div>
    </GameModal>
  )
}

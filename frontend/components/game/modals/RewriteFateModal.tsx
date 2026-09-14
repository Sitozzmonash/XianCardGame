'use client'

import { useEffect, useState } from 'react'
import { GameModal } from '@/components/game/GameModal'
import { PrimaryButton } from '@/components/game/primitives'
import { visualCard } from '@/lib/game-data'
import type { PrivateCardToken } from '@/types/card'

export function RewriteFateModal({ open, cards, sourceName, submitting, onConfirm }: {
  open: boolean
  cards: PrivateCardToken[]
  sourceName: string
  submitting: boolean
  onConfirm: (order: string[]) => void
}) {
  const [order, setOrder] = useState<PrivateCardToken[]>(cards)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  useEffect(() => { if (open) setOrder(cards) }, [open, cards])
  const move = (from: number, to: number) => setOrder((previous) => {
    if (to < 0 || to >= previous.length || from === to) return previous
    const next = [...previous]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next
  })

  return (
    <GameModal open={open} title={sourceName} subtitle="你看到的牌顶不会自动消失。最上方就是下一张将被抽到的牌；确认后才会提交顺序。" footer={<PrimaryButton fullWidth disabled={submitting || order.length === 0} onClick={() => onConfirm(order.map((item) => item.token))}>{submitting ? '正在改写天命…' : '确认此顺序'}</PrimaryButton>}>
      <div className="mb-3 rounded-xl border border-jade-400/30 bg-jade-600/15 px-3 py-2 text-sm leading-6 text-jade-300">已查看牌堆顶部 {order.length} 张牌 · 只有你能看到</div>
      <div className="space-y-2.5">
        {order.map((item, index) => { const card = visualCard(item.card_id); return (
          <div key={item.token} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) move(dragIndex, index); setDragIndex(null) }} className="reorder-row">
            <span className="reorder-index">{index + 1}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={card.art} alt={card.name} />
            <div className="min-w-0 flex-1"><p className="font-serif text-base font-semibold text-cream">{item.name || card.name}</p><p className="text-xs text-cream-faint">{index === 0 ? '下一张 · 最先抽到' : `牌顶第 ${index + 1} 张`}</p></div>
            <div className="grid gap-1"><button type="button" aria-label={`将 ${card.name} 上移`} disabled={index === 0} onClick={() => move(index, index - 1)}>↑</button><button type="button" aria-label={`将 ${card.name} 下移`} disabled={index === order.length - 1} onClick={() => move(index, index + 1)}>↓</button></div>
          </div>
        )})}
      </div>
      <p className="mt-3 text-center text-xs leading-5 text-cream-faint">可拖拽，也可用箭头调整。此决策不能关闭或跳过。</p>
    </GameModal>
  )
}

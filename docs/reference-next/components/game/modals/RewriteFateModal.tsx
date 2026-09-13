'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { GameModal } from '@/components/game/GameModal'
import { PrimaryButton, SecondaryButton } from '@/components/game/primitives'
import { CARD_BY_ID, type CardId } from '@/lib/game-data'

export function RewriteFateModal({
  open,
  cardIds,
  onConfirm,
  onClose,
}: {
  open: boolean
  cardIds: CardId[]
  onConfirm: (order: CardId[]) => void
  onClose: () => void
}) {
  const [order, setOrder] = useState<CardId[]>(cardIds)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  useEffect(() => {
    if (open) setOrder(cardIds)
  }, [open, cardIds])

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    setOrder((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  return (
    <GameModal
      open={open}
      title="逆天改命"
      subtitle="查看牌堆顶部最多 3 张牌，并重新调整顺序。最上方为下一张将被抽到的牌。"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton fullWidth onClick={onClose}>
            取消
          </SecondaryButton>
          <PrimaryButton fullWidth onClick={() => onConfirm(order)}>
            确认顺序
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-2.5">
        {order.map((cardId, index) => {
          const card = CARD_BY_ID[cardId]
          return (
            <div
              key={cardId}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) move(dragIndex, index)
                setDragIndex(null)
              }}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all',
                dragIndex === index
                  ? 'border-gold-300 bg-jade-700/40'
                  : 'border-gold-500/25 bg-ink-850/60 hover:border-gold-400/50',
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold-400/60 bg-ink-950/70 font-serif text-sm font-bold text-gold-300">
                {index + 1}
              </span>
              <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg border border-gold-500/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.art} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-sm font-semibold text-cream">{card.name}</p>
                <p className="truncate font-sans text-[10px] text-cream-faint">{card.subtitle}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  aria-label={`将 ${card.name} 上移`}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-gold-500/30 text-cream-dim transition-colors hover:border-gold-400/70 hover:text-cream disabled:opacity-30"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 15l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label={`将 ${card.name} 下移`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, index + 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md border border-gold-500/30 text-cream-dim transition-colors hover:border-gold-400/70 hover:text-cream disabled:opacity-30"
                >
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-center font-sans text-[10px] tracking-wider text-cream-faint">
        可拖拽调整，或使用箭头按钮排序
      </p>
    </GameModal>
  )
}

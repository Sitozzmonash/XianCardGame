'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { GameModal } from '@/components/game/GameModal'
import { PrimaryButton, SecondaryButton } from '@/components/game/primitives'

type ZoneId = 'top' | 'nearTop' | 'middle' | 'bottom'

const ZONES: { id: ZoneId; label: string; en: string; depth: number }[] = [
  { id: 'top', label: '顶部', en: 'TOP', depth: 2 },
  { id: 'nearTop', label: '靠近顶部', en: 'NEAR TOP', depth: 3 },
  { id: 'middle', label: '中部', en: 'MIDDLE', depth: 4 },
  { id: 'bottom', label: '底部', en: 'BOTTOM', depth: 3 },
]

export function TribulationReinsertModal({
  open,
  onConfirm,
  onClose,
}: {
  open: boolean
  onConfirm: (zone: ZoneId) => void
  onClose: () => void
}) {
  const [zone, setZone] = useState<ZoneId>('nearTop')

  return (
    <GameModal
      open={open}
      title="天劫回插"
      subtitle="使用护劫符后，将天劫秘密插入牌堆。选择位置后此信息仅你可见。"
      onClose={onClose}
      footer={
        <>
          <SecondaryButton fullWidth onClick={onClose}>
            取消
          </SecondaryButton>
          <PrimaryButton fullWidth onClick={() => onConfirm(zone)}>
            确认回插
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-2.5">
        {ZONES.map((item) => {
          const active = zone === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setZone(item.id)}
              aria-pressed={active}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all',
                active
                  ? 'border-gold-300 bg-jade-700/40 shadow-[0_0_0_1px_rgba(232,213,168,0.5)]'
                  : 'border-gold-500/25 bg-ink-850/60 hover:border-gold-400/60',
              )}
            >
              <div className="flex w-14 shrink-0 flex-col items-center gap-1">
                {Array.from({ length: item.depth }).map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 w-full rounded-full',
                      active ? 'bg-gold-400/70' : 'bg-jade-600/50',
                    )}
                  />
                ))}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-serif text-[15px] font-semibold tracking-wide text-cream">{item.label}</p>
                <p className="font-sans text-[10px] tracking-[0.2em] text-cream-faint">{item.en}</p>
              </div>

              {active && (
                <span className="shrink-0 rounded-md border border-gold-400/60 bg-ink-950/70 px-2 py-1 font-serif text-[11px] font-bold text-gold-300">
                  天劫
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-center font-sans text-[10px] tracking-wider text-cream-faint">
        越靠近顶部，天劫越早降临
      </p>
    </GameModal>
  )
}

'use client'

import { GameModal } from '@/components/game/GameModal'
import { PrimaryButton, SecondaryButton } from '@/components/game/primitives'
import type { LegalAction } from '@/types/game'

export function CounterModal({ open, actions, submitting, onAction }: { open: boolean; actions: LegalAction[]; submitting: boolean; onAction: (action: LegalAction) => void }) {
  const counter = actions.find((action) => action.type === 'COUNTER')
  const escape = actions.find((action) => action.type === 'ESCAPE')
  const pass = actions.find((action) => action.type === 'PASS_COUNTER')
  return (
    <GameModal open={open} tone="blood" title="法术袭来" subtitle="这是你的反应时机。窗口会一直保留，直到你明确选择。" footer={<>{pass && <SecondaryButton fullWidth disabled={submitting} onClick={() => onAction(pass)}>不反制</SecondaryButton>}{counter && <PrimaryButton fullWidth disabled={submitting} onClick={() => onAction(counter)}>反制并反弹</PrimaryButton>}</>}>
      <div className="space-y-3">
        <div className="rounded-2xl border border-blood-500/40 bg-blood-700/20 p-4"><h3 className="font-serif text-lg text-cream">反制符</h3><p className="mt-1 text-sm leading-6 text-cream-dim">令摄物术转向施术者，对方将承受自己的法术。</p>{!counter && <p className="mt-2 text-xs text-cream-faint">手中没有反制符</p>}</div>
        {escape && <button type="button" disabled={submitting} onClick={() => onAction(escape)} className="escape-choice"><strong>使用遁术</strong><span>完全避开此次法术，并立即结束当前结算</span></button>}
      </div>
    </GameModal>
  )
}

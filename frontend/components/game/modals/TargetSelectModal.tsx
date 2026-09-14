'use client'

import { useEffect, useState } from 'react'
import { GameModal } from '@/components/game/GameModal'
import { PlayerAvatar } from '@/components/game/PlayerAvatar'
import { PrimaryButton, SecondaryButton } from '@/components/game/primitives'
import type { PlayerPublicView } from '@/types/game'

export function TargetSelectModal({ open, targets, submitting, onConfirm, onClose }: { open: boolean; targets: PlayerPublicView[]; submitting: boolean; onConfirm: (playerId: number) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => { if (open) setSelected(null) }, [open])
  return (
    <GameModal open={open} title="选择目标" subtitle="摄物术会随机夺取目标的一张手牌；对方可能反制或遁走。" onClose={onClose} footer={<><SecondaryButton fullWidth onClick={onClose}>取消</SecondaryButton><PrimaryButton fullWidth disabled={selected === null || submitting} onClick={() => selected !== null && onConfirm(selected)}>确认目标</PrimaryButton></>}>
      <div className="space-y-2.5">{targets.map((player) => <button key={player.player_id} type="button" aria-pressed={selected === player.player_id} onClick={() => setSelected(player.player_id)} className={`target-row ${selected === player.player_id ? 'target-row-active' : ''}`}><PlayerAvatar name={player.name} seat={player.player_id} size="md" /><span><strong>{player.name}</strong><small>手牌 {player.hand_count} 张</small></span></button>)}</div>
    </GameModal>
  )
}

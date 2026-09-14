'use client'

import { useEffect, useState } from 'react'
import { GameModal } from '@/components/game/GameModal'
import { PrimaryButton } from '@/components/game/primitives'
import type { ReinsertRegion } from '@/types/game'
import { REGION_HINTS, REGION_LABELS } from '@/utils/card-catalog'

export function TribulationReinsertModal({ open, regions, submitting, onConfirm }: { open: boolean; regions: ReinsertRegion[]; submitting: boolean; onConfirm: (region: ReinsertRegion) => void }) {
  const [selected, setSelected] = useState<ReinsertRegion | null>(regions[0] ?? null)
  useEffect(() => { if (open) setSelected(regions[0] ?? null) }, [open, regions])
  return (
    <GameModal open={open} title="天劫回插" subtitle="护劫符已生效。请选择天劫重新进入牌堆的位置；此信息只有你知道。" footer={<PrimaryButton fullWidth disabled={!selected || submitting} onClick={() => selected && onConfirm(selected)}>确认回插</PrimaryButton>}>
      <div className="space-y-2.5">{regions.map((region, index) => <button key={region} type="button" aria-pressed={selected === region} onClick={() => setSelected(region)} className={`reinsert-row ${selected === region ? 'reinsert-row-active' : ''}`}><span className="reinsert-depth">{Array.from({ length: index + 2 }).map((_, line) => <i key={line} />)}</span><span><strong>{REGION_LABELS[region]}</strong><small>{REGION_HINTS[region]}</small></span></button>)}</div>
      <p className="mt-3 text-center text-xs text-cream-faint">必须确认一个位置后才能继续对局。</p>
    </GameModal>
  )
}

'use client'

import { useState } from 'react'
import { GameBackdrop } from '@/components/game/Backdrop'
import { PlayerAvatar } from '@/components/game/PlayerAvatar'
import { AISelector, Panel, PrimaryButton, SecondaryButton, SectionTitle, SegmentedSelector, TopBar } from '@/components/game/primitives'
import {
  AI_LABEL,
  AI_OPTIONS,
  DEFAULT_SEATS,
  GAMES_OPTIONS,
  ISMCTS_SIM_OPTIONS,
  MCCFR_MODEL_OPTIONS,
  type AIKind,
} from '@/lib/game-data'

const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const

export function AILabScreen({ onBack }: { onBack: () => void }) {
  const [playerCount, setPlayerCount] = useState<number>(4)
  const [kinds, setKinds] = useState<AIKind[]>(DEFAULT_SEATS.map((seat) => (seat.kind === 'human' ? 'ismcts' : seat.kind)))
  const [ismctsSims, setIsmctsSims] = useState<number>(500)
  const [mccfrModel, setMccfrModel] = useState<string>('500K')
  const [games, setGames] = useState<number>(50)

  const setKindAt = (index: number, kind: AIKind) =>
    setKinds((prev) => prev.map((value, i) => (i === index ? kind : value)))

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <GameBackdrop variant="plain" />

      <TopBar eyebrow="天劫试炼" title="AI 实验室" onBack={onBack} />

      <div className="relative z-10 flex-1 space-y-5 overflow-y-auto scrollbar-none px-5 pb-6 pt-5">
        <section className="space-y-3">
          <SectionTitle>玩家人数</SectionTitle>
          <SegmentedSelector
            options={PLAYER_COUNTS}
            value={playerCount}
            onChange={setPlayerCount}
            formatLabel={(count) => `${count} 人`}
          />
        </section>

        <section className="space-y-3">
          <SectionTitle>座位策略</SectionTitle>
          <div className="space-y-2.5">
            {DEFAULT_SEATS.slice(0, playerCount).map((seat, index) => (
              <div
                key={seat.id}
                className="rounded-2xl border border-gold-500/25 bg-ink-850/60 px-3.5 py-3"
              >
                <div className="flex items-center gap-3">
                  <PlayerAvatar name={seat.name} seat={seat.seat} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-sm font-semibold tracking-wide text-cream">{seat.name}</p>
                    <p className="font-sans text-[10px] tracking-wide text-cream-faint">P{seat.seat}</p>
                  </div>
                </div>
                <AISelector
                  className="mt-2.5"
                  value={AI_LABEL[kinds[index]]}
                  options={AI_OPTIONS.map((kind) => AI_LABEL[kind])}
                  onChange={(label) => {
                    const kind = (Object.keys(AI_LABEL) as AIKind[]).find((key) => AI_LABEL[key] === label)
                    if (kind) setKindAt(index, kind)
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        <Panel className="space-y-4">
          <SectionTitle>实验参数</SectionTitle>

          <div className="space-y-2">
            <p className="font-sans text-[11px] tracking-[0.14em] text-cream-faint">ISMCTS simulations</p>
            <SegmentedSelector size="sm" options={ISMCTS_SIM_OPTIONS} value={ismctsSims} onChange={setIsmctsSims} />
          </div>

          <div className="space-y-2">
            <p className="font-sans text-[11px] tracking-[0.14em] text-cream-faint">MCCFR 模型</p>
            <SegmentedSelector size="sm" options={MCCFR_MODEL_OPTIONS} value={mccfrModel} onChange={setMccfrModel} />
          </div>

          <div className="space-y-2">
            <p className="font-sans text-[11px] tracking-[0.14em] text-cream-faint">Games 数量</p>
            <SegmentedSelector
              size="sm"
              options={GAMES_OPTIONS}
              value={games}
              onChange={setGames}
              formatLabel={(value) => `${value} 局`}
            />
          </div>
        </Panel>
      </div>

      <div className="relative z-10 space-y-3 border-t border-gold-500/15 bg-ink-950/70 px-5 py-4 backdrop-blur-sm">
        <PrimaryButton fullWidth>开始 AI 对战</PrimaryButton>
        <SecondaryButton fullWidth onClick={onBack}>
          返回
        </SecondaryButton>
      </div>
    </div>
  )
}

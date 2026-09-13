'use client'

import { useState } from 'react'
import { GameBackdrop } from '@/components/game/Backdrop'
import { PlayerPanel } from '@/components/game/PlayerPanel'
import { Panel, PrimaryButton, SecondaryButton, SectionTitle, SegmentedSelector, TopBar } from '@/components/game/primitives'
import {
  DEFAULT_SEATS,
  ISMCTS_SIM_OPTIONS,
  MCCFR_MODEL_OPTIONS,
  type AIKind,
  type Seat,
  type SetupConfig,
} from '@/lib/game-data'

const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const

export function BattleSetupScreen({
  onStart,
  onBack,
}: {
  onStart: (config: SetupConfig) => void
  onBack: () => void
}) {
  const [playerCount, setPlayerCount] = useState<number>(3)
  const [seats, setSeats] = useState<Seat[]>(DEFAULT_SEATS)
  const [ismctsSims, setIsmctsSims] = useState<number>(500)
  const [mccfrModel, setMccfrModel] = useState<string>('100K')

  const visibleSeats = seats.slice(0, playerCount)

  const updateKind = (id: string, kind: AIKind) =>
    setSeats((prev) => prev.map((seat) => (seat.id === id ? { ...seat, kind } : seat)))

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <GameBackdrop variant="plain" />

      <TopBar eyebrow="天劫试炼" title="对战配置" onBack={onBack} />

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
          <SectionTitle>座位与对手</SectionTitle>
          <div className="space-y-2.5">
            {visibleSeats.map((seat) => (
              <PlayerPanel key={seat.id} seat={seat} onKindChange={(kind) => updateKind(seat.id, kind)} />
            ))}
          </div>
        </section>

        <Panel className="space-y-4">
          <SectionTitle>AI 参数</SectionTitle>

          <div className="space-y-2">
            <p className="font-sans text-[11px] tracking-[0.14em] text-cream-faint">ISMCTS simulations</p>
            <SegmentedSelector
              size="sm"
              options={ISMCTS_SIM_OPTIONS}
              value={ismctsSims}
              onChange={setIsmctsSims}
            />
          </div>

          <div className="space-y-2">
            <p className="font-sans text-[11px] tracking-[0.14em] text-cream-faint">MCCFR 模型</p>
            <SegmentedSelector
              size="sm"
              options={MCCFR_MODEL_OPTIONS}
              value={mccfrModel}
              onChange={setMccfrModel}
            />
          </div>
        </Panel>
      </div>

      <div className="relative z-10 space-y-3 border-t border-gold-500/15 bg-ink-950/70 px-5 py-4 backdrop-blur-sm">
        <PrimaryButton
          fullWidth
          onClick={() => onStart({ playerCount, seats: visibleSeats, ismctsSims, mccfrModel })}
        >
          开始对战
        </PrimaryButton>
        <SecondaryButton fullWidth onClick={onBack}>
          返回
        </SecondaryButton>
      </div>
    </div>
  )
}

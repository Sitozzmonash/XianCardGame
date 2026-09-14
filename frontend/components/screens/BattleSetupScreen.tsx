'use client'

import { useEffect, useMemo, useState } from 'react'
import { GameBackdrop } from '@/components/game/Backdrop'
import { PlayerPanel } from '@/components/game/PlayerPanel'
import { Panel, PrimaryButton, SecondaryButton, SectionTitle, SegmentedSelector, TopBar } from '@/components/game/primitives'
import { DEFAULT_SEATS, type AIKind, type Seat } from '@/lib/game-data'
import type { SetupConfig } from '@/store/game-store'
import type { AgentInfo } from '@/types/card'

const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const
const SIMULATION_OPTIONS = [200, 500, 1000] as const

export function BattleSetupScreen({ initial, agents, onStart, onBack }: {
  initial: SetupConfig
  agents: AgentInfo[]
  onStart: (config: SetupConfig) => void
  onBack: () => void
}) {
  const [playerCount, setPlayerCount] = useState(initial.players)
  const [seats, setSeats] = useState<Seat[]>(() => DEFAULT_SEATS.map((seat, index) => ({
    ...seat,
    kind: (initial.agentTypes[index] ?? seat.kind) as AIKind,
  })))
  const [ismctsSims, setIsmctsSims] = useState(initial.ismctsSimulations)
  const models = useMemo(
    () => agents.filter((agent) => agent.type === 'mccfr' && (!agent.players || agent.players === playerCount)),
    [agents, playerCount],
  )
  const [mccfrModel, setMccfrModel] = useState(initial.mccfrModel)
  const [seed, setSeed] = useState(initial.seed)

  useEffect(() => {
    if (models.length > 0 && !models.some((model) => model.id === mccfrModel)) setMccfrModel(models[0].id)
  }, [mccfrModel, models])

  const visibleSeats = seats.slice(0, playerCount)
  const usesMccfr = visibleSeats.some((seat) => seat.kind === 'mccfr')
  const mccfrReady = !usesMccfr || models.length > 0
  const updateKind = (id: string, kind: AIKind) => setSeats((prev) => prev.map((seat) => seat.id === id ? { ...seat, kind } : seat))

  const submit = () => onStart({
    players: playerCount,
    humanPlayer: 0,
    agentTypes: seats.map((seat) => seat.kind),
    ismctsSimulations: ismctsSims,
    mccfrModel,
    seed,
  })

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <GameBackdrop variant="plain" />
      <TopBar eyebrow="天劫试炼" title="对战配置" onBack={onBack} />
      <div className="relative z-10 flex-1 space-y-5 overflow-y-auto px-5 pb-8 pt-5 scrollbar-none">
        <section className="space-y-3">
          <SectionTitle>玩家人数</SectionTitle>
          <SegmentedSelector options={PLAYER_COUNTS} value={playerCount} onChange={setPlayerCount} formatLabel={(count) => `${count} 人`} />
        </section>
        <section className="space-y-3">
          <SectionTitle>座位与对手</SectionTitle>
          <div className="space-y-2.5">
            {visibleSeats.map((seat) => <PlayerPanel key={seat.id} seat={seat} onKindChange={(kind) => updateKind(seat.id, kind)} />)}
          </div>
        </section>
        <Panel className="space-y-5">
          <SectionTitle>AI 参数</SectionTitle>
          <div className="space-y-2">
            <p className="ui-label">ISMCTS 搜索次数</p>
            <SegmentedSelector size="sm" options={SIMULATION_OPTIONS} value={ismctsSims} onChange={setIsmctsSims} />
            <p className="ui-help">支持 ISMCTS 在线搜索；次数越高，思考越久。</p>
          </div>
          <div className="space-y-2">
            <p className="ui-label">MCCFR 训练模型</p>
            {models.length > 0 ? (
              <div className="grid gap-2">
                {models.map((model) => (
                  <button key={model.id} type="button" onClick={() => setMccfrModel(model.id)} className={`model-choice ${mccfrModel === model.id ? 'model-choice-active' : ''}`}>
                    <span>{model.name}</span><small>{model.players ? `${model.players} 人模型` : '人数未知'}</small>
                  </button>
                ))}
              </div>
            ) : <p className="rounded-xl border border-gold-500/25 bg-ink-950/50 p-3 text-sm leading-6 text-cream-dim">当前后端没有适用于 {playerCount} 人的 MCCFR 模型。ISMCTS 仍可正常使用。</p>}
          </div>
          <label className="block space-y-2">
            <span className="ui-label">随机种子（可选）</span>
            <input value={seed} onChange={(event) => setSeed(event.target.value.replace(/[^0-9-]/g, ''))} inputMode="numeric" placeholder="留空则由后端随机" className="field" />
          </label>
        </Panel>
      </div>
      <div className="relative z-20 space-y-3 border-t border-gold-500/15 bg-ink-950/90 px-5 py-4 backdrop-blur-xl">
        {!mccfrReady && <p className="text-center text-sm text-[#e8a9a9]">请为 MCCFR 座位选择当前人数可用的模型。</p>}
        <PrimaryButton fullWidth disabled={!mccfrReady} onClick={submit}>开始对战</PrimaryButton>
        <SecondaryButton fullWidth onClick={onBack}>返回</SecondaryButton>
      </div>
    </div>
  )
}

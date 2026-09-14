'use client'

import { useMemo, useState } from 'react'
import { GameBackdrop, MagicCircle } from '@/components/game/Backdrop'
import { GameCard } from '@/components/game/GameCard'
import { DeckPile, DiscardPile } from '@/components/game/Piles'
import { PlayerAvatar } from '@/components/game/PlayerAvatar'
import { PrimaryButton, SecondaryButton, StatusTag } from '@/components/game/primitives'
import { CounterModal } from '@/components/game/modals/CounterModal'
import { CardInspectorModal } from '@/components/game/modals/CardInspectorModal'
import { RewriteFateModal } from '@/components/game/modals/RewriteFateModal'
import { TargetSelectModal } from '@/components/game/modals/TargetSelectModal'
import { TribulationReinsertModal } from '@/components/game/modals/TribulationReinsertModal'
import { visualCard } from '@/lib/game-data'
import type { ActionPayload, GameView, LegalAction, ReinsertRegion } from '@/types/game'
import { directActionForCard, reorderAction, reinsertActions, targetActionFor, targetActionsForCard } from '@/utils/legal-actions'

const PHASE_TEXT: Record<string, string> = { ACTION: '行动阶段', COUNTER: '反应阶段', REORDER: '观星定序', REINSERT: '天劫回插', ENDED: '对局结束' }

export function BattleScreen({ view, selectedCardId, locked, battleLog, onSelectCard, onSubmit, onHome }: {
  view: GameView
  selectedCardId?: string
  locked: boolean
  battleLog: string[]
  onSelectCard: (instanceId?: string) => void
  onSubmit: (actionId: string, payload?: ActionPayload) => void
  onHome: () => void
}) {
  const [targetOpen, setTargetOpen] = useState(false)
  const [inspectedCardId, setInspectedCardId] = useState<string>()
  const players = view.public.players
  const self = players.find((player) => player.player_id === view.viewer_player_id) ?? players[0]
  const opponents = players.filter((player) => player.player_id !== view.viewer_player_id)
  const selected = view.observation.hand.find((card) => card.instance_id === selectedCardId)
  const direct = selected ? directActionForCard(view, selected.instance_id) : undefined
  const targetActions = selected ? targetActionsForCard(view, selected.instance_id) : []
  const inspectedCard = inspectedCardId ? visualCard(inspectedCardId) : undefined
  const inspectedAction = inspectedCardId
    ? (() => {
        const instance = view.observation.hand.find((item) => item.card_id === inspectedCardId)
        return instance ? directActionForCard(view, instance.instance_id) ?? targetActionsForCard(view, instance.instance_id)[0] : undefined
      })()
    : undefined
  const endAction = view.legal_actions.find((action) => action.type === 'END_ACTION')
  const reorder = reorderAction(view)
  const reinsert = reinsertActions(view)[0]
  const regions = (reinsert?.params?.region?.options ?? []) as ReinsertRegion[]
  const knownTop = view.observation.known_top
  const reorderSource = [...view.events]
    .reverse()
    .find((event) => event.type === 'CARD_PLAYED')?.data?.card_id === 'REWRITE_FATE'
    ? '逆天改命'
    : '观星术'
  const lastDiscard = view.public.last_discard ? visualCard(view.public.last_discard).art : undefined
  const canAct = view.decision_player === view.viewer_player_id && !locked
  const targets = useMemo(() => {
    const ids = new Set(targetActions.flatMap((action) => action.params?.target_player?.options ?? []))
    return players.filter((player) => ids.has(player.player_id) && player.alive)
  }, [players, targetActions])

  const useSelected = () => {
    if (!selected) return
    if (targetActions.length > 0) setTargetOpen(true)
    else if (direct) onSubmit(direct.id)
  }

  return (
    <div className="battle-shell">
      <GameBackdrop variant="plain" />
      <header className="battle-header">
        <div className="header-tools"><button type="button" onClick={onHome} className="header-link">退出对局</button><button type="button" onClick={() => setInspectedCardId(selected?.card_id ?? 'STARGAZING')} className="header-card-guide">卡牌说明</button></div>
        <div><p>第 {view.public.round} 轮 · 修仙试炼</p><h1>{PHASE_TEXT[view.phase] ?? view.phase}</h1></div>
        <StatusTag tone={canAct ? 'jade' : 'muted'}>{canAct ? '轮到你' : '演算中'}</StatusTag>
      </header>
      <div className="opponent-rail">{opponents.map((player) => <article key={player.player_id} className={`opponent-card ${player.is_current ? 'opponent-current' : ''} ${!player.alive ? 'opponent-fallen' : ''}`}><PlayerAvatar name={player.name} seat={player.player_id} size="sm" alive={player.alive} /><div><strong>{player.name}</strong><span>{player.agent?.type?.toUpperCase() ?? 'AI'} · 手牌 {player.hand_count} 张</span></div>{player.is_current && <i>行动</i>}</article>)}</div>
      <main className="battlefield">
        <MagicCircle className="left-1/2 top-1/2 h-[min(62vw,420px)] w-[min(62vw,420px)] -translate-x-1/2 -translate-y-1/2 opacity-80" />
        <DeckPile count={view.public.deck_count} className="absolute left-3 top-4 md:left-8" />
        <DiscardPile count={view.public.discard_count} topCardArt={lastDiscard} className="absolute right-3 top-4 md:right-8" />
        <div className="phase-orb"><span>修</span><strong>{PHASE_TEXT[view.phase] ?? '天机流转'}</strong><small>{canAct ? `还可行动 ${Math.max(0, view.observation.max_actions_per_turn - view.observation.actions_used)} 次` : '请观看当前演出'}</small></div>
        {knownTop.length > 0 && <aside className="known-top"><h2>你已知的牌顶</h2><div>{knownTop.map((item, index) => { const card = visualCard(item.card_id); return <span key={`${item.position}-${item.card_id}`} title={card.name}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={card.art} alt={card.name} /><b>{index + 1}</b></span> })}</div><p>仅你可见 · 左侧为下一张</p></aside>}
      </main>
      <section className="self-panel"><PlayerAvatar name={self?.name ?? '我'} seat={view.viewer_player_id} size="sm" /><div><strong>{self?.name ?? '我'}</strong><span>手牌 {view.observation.hand.length} 张 · 已行动 {view.observation.actions_used}/{view.observation.max_actions_per_turn}</span></div><details className="battle-log"><summary>记录 {battleLog.length}</summary><div>{battleLog.length === 0 ? <p>尚无事件</p> : [...battleLog].reverse().map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></details></section>
      <section className="hand-rail" aria-label="我的手牌">{view.observation.hand.map((instance, index) => { const card = visualCard(instance.card_id); const playable = Boolean(directActionForCard(view, instance.instance_id) || targetActionsForCard(view, instance.instance_id).length); return <GameCard key={instance.instance_id} card={card} size="sm" index={index + 1} selected={selectedCardId === instance.instance_id} dimmed={!playable || locked} onClick={() => { onSelectCard(instance.instance_id); setInspectedCardId(instance.card_id) }} /> })}</section>
      <footer className="battle-actions"><div className="selected-caption"><span>{selected ? `已选【${selected.name || visualCard(selected.card_id).name}】` : '选择一张手牌，先阅读效果再出牌'}</span><small>{selected ? visualCard(selected.card_id).effect : locked ? '演出结束后可以继续操作' : !canAct ? '正在等待其他玩家' : '每张牌都可点击查看作用与使用时机'}</small>{selected && <button type="button" className="card-detail-link" onClick={() => setInspectedCardId(selected.card_id)}>查看卡牌详解</button>}</div><SecondaryButton disabled={!endAction || !canAct} onClick={() => endAction && onSubmit(endAction.id)}>结束并抽牌</SecondaryButton><PrimaryButton disabled={!selected || (!direct && targetActions.length === 0) || !canAct} onClick={useSelected}>{targetActions.length > 0 ? '选择目标' : '使用卡牌'}</PrimaryButton></footer>
      <TargetSelectModal open={targetOpen} targets={targets} submitting={locked} onClose={() => setTargetOpen(false)} onConfirm={(playerId) => { if (!selected) return; const action = targetActionFor(view, selected.instance_id, playerId); if (action) { setTargetOpen(false); onSubmit(action.id, { target_player: playerId }) } }} />
      <CounterModal open={view.phase === 'COUNTER' && !locked} actions={view.legal_actions} submitting={locked} onAction={(action: LegalAction) => onSubmit(action.id)} />
      <RewriteFateModal open={view.phase === 'REORDER' && !locked} cards={view.observation.private_context?.cards ?? []} sourceName={`${reorderSource}·牌顶定序`} submitting={locked} onConfirm={(order) => reorder && onSubmit(reorder.id, { order })} />
      <TribulationReinsertModal open={view.phase === 'REINSERT' && !locked} regions={regions} submitting={locked} onConfirm={(region) => reinsert && onSubmit(reinsert.id, { region })} />
      <CardInspectorModal open={Boolean(inspectedCard)} card={inspectedCard} action={inspectedAction} onClose={() => setInspectedCardId(undefined)} />
    </div>
  )
}

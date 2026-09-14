'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { HomeScreen } from '@/components/screens/HomeScreen'
import { BattleSetupScreen } from '@/components/screens/BattleSetupScreen'
import { BattleScreen } from '@/components/screens/BattleScreen'
import { CardDetailScreen } from '@/components/screens/CardDetailScreen'
import { CollectionScreen } from '@/components/screens/CollectionScreen'
import { ResultScreen } from '@/components/screens/ResultScreen'
import { EventStage, type PlaybackPace } from '@/components/game/EventStage'
import { fetchAgents } from '@/api/game'
import { apiEndpoint } from '@/api/game'
import { useGameStore, selectInputLocked, type SetupConfig } from '@/store/game-store'
import type { AgentInfo } from '@/types/card'
import type { CardId, MatchResult } from '@/lib/game-data'
import type { Screen } from '@/lib/navigation'

const BUILTIN_AGENTS: AgentInfo[] = [
  { id: 'random', name: 'Random', type: 'random' },
  { id: 'rule', name: 'Rule', type: 'rule' },
  { id: 'ismcts', name: 'ISMCTS', type: 'ismcts', configurable: true },
]

export function GameApp() {
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedCatalogCard, setSelectedCatalogCard] = useState<CardId>('nitiangaiming')
  const [agents, setAgents] = useState<AgentInfo[]>(BUILTIN_AGENTS)
  const [pace, setPace] = useState<PlaybackPace>('standard')
  const [paused, setPaused] = useState(false)
  const store = useGameStore()
  const locked = selectInputLocked(store)
  const activeEvent = store.animationQueue[0]

  useEffect(() => {
    const saved = window.localStorage.getItem('xiancardgame:pace') as PlaybackPace | null
    if (saved === 'slow' || saved === 'standard' || saved === 'quick') setPace(saved)
    const controller = new AbortController()
    fetchAgents(controller.signal).then((items) => setAgents(items.length > 0 ? items : BUILTIN_AGENTS)).catch(() => setAgents(BUILTIN_AGENTS))
    return () => controller.abort()
  }, [store.mockMode])

  const changePace = (next: PlaybackPace) => { setPace(next); window.localStorage.setItem('xiancardgame:pace', next) }
  const go = (next: Screen) => { setPaused(false); setScreen(next) }
  const startBattle = async (config: SetupConfig) => { store.setSetup(config); const gameId = await store.createGame(config); if (gameId) go('battle') }
  const leaveBattle = () => { store.clearGame(); go('home') }
  const replay = async () => { const gameId = await store.createGame(); if (gameId) go('battle') }
  const openCatalogCard = (cardId: CardId) => { setSelectedCatalogCard(cardId); go('detail') }
  const nextEvent = useCallback(() => { setPaused(false); store.dequeueEvent() }, [store])

  const result = useMemo<MatchResult>(() => {
    const view = store.view
    const winnerId = typeof view?.winner === 'number' ? view.winner : view?.public.players.find((player) => player.alive)?.player_id
    const winner = view?.public.players.find((player) => player.player_id === winnerId)
    const ranking = [...(view?.public.players ?? [])].sort((a, b) => Number(b.alive) - Number(a.alive)).map((player, index) => ({ rank: index + 1, name: player.name, status: player.alive ? 'alive' as const : 'out' as const }))
    return { success: winnerId === view?.viewer_player_id, winner: winner?.name ?? '天机未定', winnerTitle: winnerId === view?.viewer_player_id ? '最后存活 · 证道成功' : '此局胜者', rounds: view?.public.round ?? 0, plays: store.battleLog.filter((line) => line.includes('打出')).length, tribulations: store.battleLog.filter((line) => line.includes('天劫')).length, ranking }
  }, [store.view, store.battleLog])

  const ended = store.view?.status === 'ended' || store.view?.phase === 'ENDED'
  useEffect(() => { if (screen === 'battle' && ended && store.animationQueue.length === 0) setScreen('result') }, [ended, screen, store.animationQueue.length])

  return (
    <div className="app-viewport">
      <div className="app-frame">
        {screen === 'home' && <HomeScreen onNavigate={go} />}
        {screen === 'setup' && <BattleSetupScreen initial={store.setup} agents={agents} onStart={startBattle} onBack={() => go('home')} />}
        {screen === 'ailab' && <BattleSetupScreen initial={store.setup} agents={agents} onStart={startBattle} onBack={() => go('home')} />}
        {screen === 'battle' && store.view && <BattleScreen view={store.view} selectedCardId={store.selectedCardId} locked={locked} battleLog={store.battleLog} onSelectCard={store.selectCard} onSubmit={store.submitAction} onHome={leaveBattle} />}
        {screen === 'detail' && <CardDetailScreen cardId={selectedCatalogCard} onBack={() => go('collection')} onUse={() => go('setup')} onSelectCard={setSelectedCatalogCard} />}
        {screen === 'collection' && <CollectionScreen onBack={() => go('home')} onSelectCard={openCatalogCard} />}
        {screen === 'result' && <ResultScreen result={result} onReplay={replay} onHome={leaveBattle} />}

        {store.error && <div className="toast toast-error" role="alert"><span>{store.error}</span><button type="button" onClick={store.clearError}>知道了</button></div>}
        {store.notice && <div className="toast" role="status"><span>{store.notice}</span><button type="button" onClick={store.clearError}>关闭</button></div>}
        {screen === 'home' && <div className="connection-pill"><i className={store.mockMode ? 'mock' : ''} /><span>{store.mockMode ? '演示数据' : `后端 · ${apiEndpoint().replace(/^https?:\/\//, '').split('/')[0]}`}</span></div>}
        <EventStage event={screen === 'battle' ? activeEvent : undefined} view={store.view} pace={pace} paused={paused} onPace={changePace} onPaused={setPaused} onNext={nextEvent} onSkipAll={() => { setPaused(false); store.skipAnimations() }} />
      </div>
    </div>
  )
}

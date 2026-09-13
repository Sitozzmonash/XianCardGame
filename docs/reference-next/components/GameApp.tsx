'use client'

import { useState } from 'react'
import { HomeScreen } from '@/components/screens/HomeScreen'
import { BattleSetupScreen } from '@/components/screens/BattleSetupScreen'
import { BattleScreen } from '@/components/screens/BattleScreen'
import { CardDetailScreen } from '@/components/screens/CardDetailScreen'
import { CollectionScreen } from '@/components/screens/CollectionScreen'
import { ResultScreen } from '@/components/screens/ResultScreen'
import { AILabScreen } from '@/components/screens/AILabScreen'
import { TargetSelectModal } from '@/components/game/modals/TargetSelectModal'
import { CounterModal } from '@/components/game/modals/CounterModal'
import { RewriteFateModal } from '@/components/game/modals/RewriteFateModal'
import { TribulationReinsertModal } from '@/components/game/modals/TribulationReinsertModal'
import {
  DEFAULT_SEATS,
  MOCK_RESULT,
  MOCK_RESULT_FAIL,
  type CardId,
  type Seat,
  type SetupConfig,
} from '@/lib/game-data'
import type { ModalKind, Screen } from '@/lib/navigation'

/** Which modal a card opens when the player taps 使用卡牌. */
const CARD_MODAL: Partial<Record<CardId, Exclude<ModalKind, null>>> = {
  shewushu: 'target',
  fanzhifu: 'counter',
  guanxingshu: 'rewrite',
  nitiangaiming: 'rewrite',
  hujiefu: 'reinsert',
}

const REWRITE_CARDS: CardId[] = ['guanxingshu', 'tianjie', 'dunshu']

export function GameApp() {
  const [screen, setScreen] = useState<Screen>('home')
  const [seats, setSeats] = useState<Seat[]>(DEFAULT_SEATS.slice(0, 3))
  const [round, setRound] = useState(1)
  const [selectedCard, setSelectedCard] = useState<CardId>('nitiangaiming')
  const [modal, setModal] = useState<ModalKind>(null)
  const [resultSuccess, setResultSuccess] = useState(true)

  const go = (next: Screen) => {
    setModal(null)
    setScreen(next)
  }

  const startBattle = (config: SetupConfig) => {
    setSeats(config.seats)
    setRound(1)
    go('battle')
  }

  const openCard = (cardId: CardId) => {
    setSelectedCard(cardId)
    go('detail')
  }

  const useCard = (cardId: CardId) => {
    const next = CARD_MODAL[cardId]
    if (next) {
      setModal(next)
      return
    }
    go('battle')
  }

  const endTurn = () => {
    if (round >= 3) {
      setResultSuccess(true)
      go('result')
      return
    }
    setRound((value) => value + 1)
  }

  const surrender = () => {
    setResultSuccess(false)
    go('result')
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#020807] sm:p-6">
      <div className="relative h-[100dvh] w-full max-w-[430px] overflow-hidden bg-ink-950 sm:h-[932px] sm:max-h-[92vh] sm:rounded-[2.25rem] sm:border sm:border-gold-500/25 sm:shadow-[0_50px_140px_-50px_rgba(0,0,0,1)]">
        {screen === 'home' && <HomeScreen onNavigate={go} />}

        {screen === 'setup' && <BattleSetupScreen onStart={startBattle} onBack={() => go('home')} />}

        {screen === 'ailab' && <AILabScreen onBack={() => go('home')} />}

        {screen === 'battle' && (
          <BattleScreen
            seats={seats}
            round={round}
            onCardClick={openCard}
            onEndTurn={endTurn}
            onSurrender={surrender}
          />
        )}

        {screen === 'detail' && (
          <CardDetailScreen
            cardId={selectedCard}
            onBack={() => go('battle')}
            onUse={useCard}
            onSelectCard={setSelectedCard}
          />
        )}

        {screen === 'collection' && <CollectionScreen onBack={() => go('home')} onSelectCard={openCard} />}

        {screen === 'result' && (
          <ResultScreen
            result={resultSuccess ? MOCK_RESULT : MOCK_RESULT_FAIL}
            onReplay={() => {
              setRound(1)
              go('battle')
            }}
            onHome={() => go('home')}
            onToggleOutcome={() => setResultSuccess((value) => !value)}
          />
        )}

        <TargetSelectModal
          open={modal === 'target'}
          seats={seats}
          onConfirm={() => go('battle')}
          onClose={() => setModal(null)}
        />

        <CounterModal
          open={modal === 'counter'}
          casterName={seats.find((seat) => !seat.isSelf)?.name ?? '玄墨真人'}
          onUse={() => go('battle')}
          onDecline={() => go('battle')}
        />

        <RewriteFateModal
          open={modal === 'rewrite'}
          cardIds={REWRITE_CARDS}
          onConfirm={() => go('battle')}
          onClose={() => setModal(null)}
        />

        <TribulationReinsertModal
          open={modal === 'reinsert'}
          onConfirm={() => go('battle')}
          onClose={() => setModal(null)}
        />
      </div>
    </div>
  )
}

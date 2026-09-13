'use client'

import { GameBackdrop, MagicCircle } from '@/components/game/Backdrop'
import { PlayerAvatar } from '@/components/game/PlayerAvatar'
import { Panel, PrimaryButton, SecondaryButton, SectionTitle, StatusTag, TopBar } from '@/components/game/primitives'
import type { MatchResult } from '@/lib/game-data'

export function ResultScreen({
  result,
  onReplay,
  onHome,
  onToggleOutcome,
}: {
  result: MatchResult
  onReplay: () => void
  onHome: () => void
  onToggleOutcome: () => void
}) {
  const stats = [
    { label: '回合', value: result.rounds },
    { label: '出牌', value: result.plays },
    { label: '渡劫', value: result.tribulations },
  ]

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <GameBackdrop variant="plain" />

      <TopBar
        eyebrow="天劫试炼"
        title={result.success ? '渡劫成功' : '道消身殒'}
        right={
          <button
            type="button"
            onClick={onToggleOutcome}
            className="rounded-full border border-gold-500/30 px-3 py-1 font-sans text-[10px] tracking-wider text-cream-faint transition-colors hover:border-gold-400/60 hover:text-cream-dim"
          >
            切换结局
          </button>
        }
      />

      <div className="relative z-10 flex-1 space-y-5 overflow-y-auto scrollbar-none px-5 pb-6 pt-6">
        <div className="relative flex flex-col items-center">
          <MagicCircle
            className="left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2"
            tone={result.success ? 'gold' : 'jade'}
          />
          <div className="relative">
            <PlayerAvatar name={result.winner} size="lg" seat={4} />
          </div>
          <h2 className="relative mt-4 font-serif text-2xl font-bold tracking-[0.14em] text-cream text-glow-gold">
            {result.winner}
          </h2>
          <p className="relative mt-1 font-sans text-[11px] tracking-[0.2em] text-jade-300/85">{result.winnerTitle}</p>
        </div>

        <Panel className="grid grid-cols-3 divide-x divide-gold-500/15 py-4">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-col items-center gap-1.5">
              <span className="font-sans text-[11px] tracking-[0.2em] text-cream-faint">{stat.label}</span>
              <span className="font-serif text-3xl font-bold text-gold-300 text-glow-gold">{stat.value}</span>
            </div>
          ))}
        </Panel>

        <section className="space-y-3">
          <SectionTitle>最终排名</SectionTitle>
          <div className="space-y-2">
            {result.ranking.map((entry) => (
              <div
                key={entry.rank}
                className="flex items-center gap-3 rounded-xl border border-gold-500/20 bg-ink-850/60 px-3.5 py-2.5"
              >
                <span className="w-5 shrink-0 font-serif text-sm font-bold text-gold-400">{entry.rank}</span>
                <span className="min-w-0 flex-1 truncate font-serif text-sm text-cream">{entry.name}</span>
                <StatusTag tone={entry.status === 'alive' ? 'jade' : 'muted'}>
                  {entry.status === 'alive' ? '存活' : '淘汰'}
                </StatusTag>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-3 border-t border-gold-500/15 bg-ink-950/70 px-5 py-4 backdrop-blur-sm">
        <PrimaryButton onClick={onReplay}>再来一局</PrimaryButton>
        <SecondaryButton onClick={onHome}>返回主页</SecondaryButton>
      </div>
    </div>
  )
}

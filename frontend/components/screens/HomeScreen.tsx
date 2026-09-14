'use client'

import { GameBackdrop, MagicCircle } from '@/components/game/Backdrop'
import { IconButton, PrimaryButton, SecondaryButton } from '@/components/game/primitives'
import type { Screen } from '@/lib/navigation'

export function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <GameBackdrop variant="home" />

      {/* Hero key art, faded into the cloud sea. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[150px] top-[92px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-cultivator.png"
          alt=""
          className="h-full w-full object-cover object-top opacity-90"
          style={{
            maskImage: 'radial-gradient(75% 70% at 50% 45%, #000 45%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(75% 70% at 50% 45%, #000 45%, transparent 100%)',
          }}
        />
      </div>
      <MagicCircle className="left-1/2 top-[38%] h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 opacity-70" />

      <div className="relative z-10 flex items-center justify-end px-5 pt-6">
        <IconButton label="设置">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 007 19.4a1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a1.7 1.7 0 00-1.7-1H1a2 2 0 110-4h.1A1.7 1.7 0 003 9a1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.6V4a2 2 0 114 0v.1A1.7 1.7 0 0017 5.6a1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11h.1a2 2 0 110 4H21a1.7 1.7 0 00-1.6 1z" />
          </svg>
        </IconButton>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
        {/* Scrim keeps the title legible over the bright key art. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_42%_at_50%_50%,rgba(4,13,12,0.88)_0%,rgba(4,13,12,0.5)_55%,transparent_100%)]" />
        <p className="relative font-sans text-xs font-medium tracking-[0.3em] text-jade-300">天命既定 · 亦可改之</p>
        <h1 className="relative mt-3 font-serif text-[52px] font-black leading-none tracking-[0.1em] text-cream text-glow-gold">
          天劫战牌
        </h1>
        <div className="gold-hairline relative mt-4 h-px w-40" />
        <p className="relative mt-4 font-sans text-xs tracking-[0.24em] text-cream">2-6 人 · 策略卡牌 · 修仙主题</p>
      </div>

      <div className="relative z-10 space-y-3 px-6 pb-6">
        <PrimaryButton fullWidth onClick={() => onNavigate('setup')}>
          开启对决
        </PrimaryButton>
        <div className="grid grid-cols-2 gap-3">
          <SecondaryButton onClick={() => onNavigate('collection')}>卡牌图鉴</SecondaryButton>
          <SecondaryButton onClick={() => onNavigate('ailab')}>AI 对战</SecondaryButton>
        </div>
        <p className="pt-1 text-center font-sans text-xs tracking-[0.08em] text-cream-faint">
          论道对战（排位赛）· 赛季结算倒计时：4 天
        </p>
      </div>
    </div>
  )
}

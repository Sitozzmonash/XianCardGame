'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { GameEvent } from '@/types/event'
import type { GameView } from '@/types/game'
import { presentEvent } from '@/utils/event-log'
import { playerNameOf } from '@/utils/legal-actions'

export type PlaybackPace = 'slow' | 'standard' | 'quick'

const SPEED: Record<PlaybackPace, number> = { slow: 1.35, standard: 1, quick: 0.65 }
const LABEL: Record<PlaybackPace, string> = { slow: '慢速', standard: '标准', quick: '快速' }

export function EventStage({ event, view, pace, paused, onPace, onPaused, onNext, onSkipAll }: {
  event?: GameEvent
  view?: GameView
  pace: PlaybackPace
  paused: boolean
  onPace: (pace: PlaybackPace) => void
  onPaused: (paused: boolean) => void
  onNext: () => void
  onSkipAll: () => void
}) {
  const presentation = useMemo(() => event ? presentEvent(event, (id) => playerNameOf(view, id)) : null, [event, view])
  const [progressKey, setProgressKey] = useState(0)

  useEffect(() => {
    if (!event || !presentation || paused) return
    setProgressKey((value) => value + 1)
    const duration = Math.max(1900, presentation.durationMs * 1.65) * SPEED[pace]
    const timer = window.setTimeout(onNext, duration)
    return () => window.clearTimeout(timer)
  }, [event, pace, paused, presentation, onNext])

  if (!event || !presentation) return null
  const effect = event.type.includes('TRIBULATION') ? 'thunder' : event.type.includes('PEEK') || event.type.includes('REORDER') ? 'stars' : event.type.includes('SHUFFLE') ? 'ripple' : presentation.impact ? 'impact' : 'soft'
  const duration = Math.max(1900, presentation.durationMs * 1.65) * SPEED[pace]

  return (
    <div className={cn('event-stage', `event-${effect}`)} role="status" aria-live="polite">
      <div className="event-vignette" />
      <div className="event-sigil" aria-hidden="true"><span>{presentation.tone === 'danger' ? '劫' : presentation.tone === 'gold' ? '御' : '术'}</span></div>
      <div className="event-copy">
        <p className="event-kicker">第 {event.seq} 则 · 天机流转</p>
        <h2>{presentation.title}</h2>
        <p>{presentation.detail}</p>
      </div>
      <div className="event-controls">
        <div className="pace-switch" aria-label="演出速度">
          {(Object.keys(LABEL) as PlaybackPace[]).map((item) => <button key={item} type="button" aria-pressed={pace === item} onClick={() => onPace(item)}>{LABEL[item]}</button>)}
        </div>
        <button type="button" onClick={() => onPaused(!paused)}>{paused ? '继续演出' : '暂停'}</button>
        <button type="button" onClick={onNext}>下一幕</button>
        <button type="button" onClick={onSkipAll}>全部跳过</button>
      </div>
      {!paused && <div key={progressKey} className="event-progress" style={{ animationDuration: `${duration}ms` }} />}
    </div>
  )
}

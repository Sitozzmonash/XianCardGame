import { describe, expect, it } from 'vitest'
import { presentEvent } from '@/utils/event-log'

describe('event presentation', () => {
  const nameOf = (id: number | null | undefined) => id === 0 ? '我' : id === 1 ? '玄墨真人' : '天机'

  it('shows the actual played card card name', () => {
    const result = presentEvent({ seq: 1, type: 'CARD_PLAYED', actor: 1, data: { card_id: 'STARGAZING', name: '观星术' } }, nameOf)
    expect(result.title).toContain('观星术')
    expect(result.title).toContain('玄墨真人')
  })

  it('keeps tribulation as an emphasized long event', () => {
    const result = presentEvent({ seq: 2, type: 'TRIBULATION_DRAWN', actor: 0, data: {} }, nameOf)
    expect(result.impact).toBe(true)
    expect(result.durationMs).toBeGreaterThanOrEqual(1200)
  })

  it('describes the shared top-card reorder without inventing private details', () => {
    const result = presentEvent({ seq: 3, type: 'DECK_REORDERED', actor: 0, data: {} }, nameOf)
    expect(result.title).toBe('牌顶定序完成')
  })
})

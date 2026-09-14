import { describe, expect, it } from 'vitest'
import { cardIdForEvent } from '@/utils/event-card'

describe('cardIdForEvent', () => {
  it('uses an explicitly published card id', () => {
    expect(cardIdForEvent({ seq: 1, type: 'CARD_PLAYED', data: { card_id: 'STEAL' } })).toBe('STEAL')
  })

  it('explains published reaction and deck events without revealing hidden cards', () => {
    expect(cardIdForEvent({ seq: 2, type: 'COUNTER_USED' })).toBe('COUNTER')
    expect(cardIdForEvent({ seq: 3, type: 'DECK_PEEKED' })).toBe('STARGAZING')
    expect(cardIdForEvent({ seq: 4, type: 'CARD_DRAWN', data: { hand_count: 5 } })).toBeUndefined()
  })

  it('uses a consumed card when the backend publishes one', () => {
    expect(cardIdForEvent({ seq: 5, type: 'TRIBULATION_DEFUSED', data: { consumed_card: 'DEFUSE' } })).toBe('DEFUSE')
  })
})

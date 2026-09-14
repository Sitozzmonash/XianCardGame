import { describe, expect, it } from 'vitest'
import { normalizeView } from '@/api/game'

describe('normalizeView', () => {
  it('preserves the private top cards and maps the backend reorder phase', () => {
    const view = normalizeView({
      game_id: 'g1', revision: 3, phase: 'REORDER_TOP', viewer_player_id: 0,
      observation: { hand: [], known_top: [], actions_used: 1, max_actions_per_turn: 2, private_context: { cards: [
        { token: 'private_1', card_id: 'TRIBULATION', name: '天劫' },
        { token: 'private_2', card_id: 'DEFUSE', name: '护劫符' },
        { token: 'private_3', card_id: 'STARGAZING', name: '观星术' },
      ] } },
      public: { round: 1, deck_count: 10, discard_count: 1, players: [] },
      legal_actions: [{ id: 'reorder', type: 'REORDER_TOP', label: '调整顺序' }], events: [],
    })
    expect(view.phase).toBe('REORDER')
    expect(view.observation.private_context?.cards.map((card) => card.card_id)).toEqual(['TRIBULATION', 'DEFUSE', 'STARGAZING'])
    expect(view.legal_actions[0].id).toBe('reorder')
  })

  it('sorts animation events by sequence', () => {
    const view = normalizeView({ observation: {}, public: {}, legal_actions: [], events: [
      { seq: 9, type: 'TURN_ENDED' }, { seq: 7, type: 'CARD_PLAYED', data: { name: '观星术' } },
    ] })
    expect(view.events.map((event) => event.seq)).toEqual([7, 9])
  })
})

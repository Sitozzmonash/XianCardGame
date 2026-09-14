import type { GameEvent } from '@/types/event'

/**
 * 只为已经公开的事件补充卡牌说明，绝不能从抽牌、偷牌等私密事件推测牌面。
 */
export function cardIdForEvent(event: GameEvent): string | undefined {
  if (event.data?.card_id) return event.data.card_id
  if (event.data?.consumed_card) return event.data.consumed_card

  const inferred: Partial<Record<GameEvent['type'], string>> = {
    COUNTER_USED: 'COUNTER',
    ESCAPE_DODGED: 'ESCAPE',
    DECK_PEEKED: 'STARGAZING',
    DECK_SHUFFLED: 'SHUFFLE',
    TRIBULATION_DEFUSED: 'DEFUSE',
  }

  return inferred[event.type]
}

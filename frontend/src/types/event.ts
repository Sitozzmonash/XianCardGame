/**
 * 事件类型 —— API_CONTRACT.md §13/§14。
 * events 只用于「动画 + 战斗日志」，绝不参与规则判断。
 */
import type { CardId } from './card';

export type GameEventType =
  | 'GAME_STARTED'
  | 'TURN_STARTED'
  | 'CARD_PLAYED'
  | 'CARD_DRAWN'
  | 'CARD_STOLEN'
  | 'COUNTER_OPENED'
  | 'COUNTER_USED'
  | 'COUNTER_PASSED'
  | 'DECK_PEEKED'
  | 'DECK_REORDERED'
  | 'DECK_SHUFFLED'
  | 'TURN_SKIPPED'
  | 'TRIBULATION_DRAWN'
  | 'TRIBULATION_DEFUSED'
  | 'TRIBULATION_REINSERTED'
  | 'PLAYER_ELIMINATED'
  | 'TURN_ENDED'
  | 'GAME_ENDED';

export type ReinsertRegion = 'TOP' | 'NEAR_TOP' | 'MIDDLE' | 'BOTTOM';

/**
 * event.data：契约只固定了少数键（如 TRIBULATION_DEFUSED 的 consumed_card），
 * 其余留给后端扩展，因此保留未知键的索引签名以做前向兼容。
 */
export interface GameEventData {
  consumed_card?: CardId | string;
  region?: ReinsertRegion | string;
  position?: number;
  amount?: number;
  winner?: number | null;
  reason?: string;
  /** 后端未来新增字段 */
  [key: string]: unknown;
}

export interface GameEvent {
  /** 同一响应内严格递增，前端按 seq 顺序播放动画 */
  seq: number;
  type: GameEventType;
  /** 动作发起者；系统事件可为空 */
  actor?: number | null;
  /** 相关玩家（如 CARD_STOLEN 的受害者、PLAYER_ELIMINATED 的目标） */
  target?: number | null;
  card_id?: CardId | string | null;
  /** 服务端可直接给出中文描述，前端优先使用它作为日志文案 */
  message?: string | null;
  data?: GameEventData | null;
}

/**
 * 事件类型 —— API_CONTRACT.md §13/§14。
 * events 只用于「动画 + 战斗日志」，绝不参与规则判断。
 *
 * ⚠️ 线上形状以 `backend/app/services/events.py` 的 `render_event()` 为准：
 * **每个事件只允许 `seq / type / actor / data` 四个键**，牌名、受害者、区域等信息
 * 一律在 `data` 里。曾经前端按顶层 `event.card_id` / `event.target` 读，
 * 真后端下恒为 null → 日志里每张牌都显示「未知牌」、淘汰者显示「天机」（已修）。
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
  | 'ESCAPE_DODGED'
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
 * `event.data`：真实字段一览（每个事件只带自己那几个键）。
 *
 * | 事件 | data 键 |
 * |---|---|
 * | `GAME_STARTED` | `players` |
 * | `TURN_STARTED` | `turn_no` |
 * | `CARD_PLAYED` | `card_id`、**`name`（后端直接给中文牌名）** |
 * | `CARD_DRAWN` | `hand_count`（**不给牌面**，牌面只有本人可见） |
 * | `CARD_STOLEN` | `target`（受害者；**不给被偷的牌**——谁被偷是公开的，偷到什么是私有的）；`redirected=true` 表示这是反制反弹造成的夺取（`actor`=反弹方，`target`=原施术者） |
 * | `COUNTER_OPENED` | `target`（被偷的那位，即需要决定是否反制的人） |
 * | `COUNTER_USED` | `redirected`（true=反制符反弹生效）、`stolen`（反弹时是否真的拿到牌） |
 * | `ESCAPE_DODGED` | `target`（施术者）；`actor`=用遁术躲开的人。法术完全无效，本次结算立即结束 |
 * | `COUNTER_PASSED` / `DECK_REORDERED` / `DECK_SHUFFLED` / `TURN_ENDED` / `TRIBULATION_DRAWN` | 无 |
 * | `TURN_SKIPPED` | **保留但不再产生**（旧规则「遁术跳过抽牌」的遗留事件，见 INTERFACES A13） |
 * | `DECK_PEEKED` | `count`；仅本人可见时另带 `cards[]` |
 * | `TRIBULATION_REINSERTED` | `region` |
 * | `TRIBULATION_DEFUSED` | `consumed_card`（恒为 `DEFUSE`） |
 * | `PLAYER_ELIMINATED` | 无（**被淘汰者就在 `actor` 里**） |
 * | `GAME_ENDED` | `winner`、`forced_stop` |
 */
export interface GameEventData {
  card_id?: CardId | string;
  /** `CARD_PLAYED` 的中文牌名（后端已本地化，优先用它） */
  name?: string;
  /** 事件涉及的另一个座位（`CARD_STOLEN` / `COUNTER_OPENED` 的受害者） */
  target?: number;
  region?: ReinsertRegion | string;
  consumed_card?: CardId | string;
  /** `CARD_DRAWN` 抽牌后的手牌数 */
  hand_count?: number;
  /** `DECK_PEEKED` 看到的张数 */
  count?: number;
  /** `TURN_STARTED` 的轮次序号 */
  turn_no?: number;
  /** `GAME_STARTED` */
  players?: number;
  /** `GAME_ENDED` */
  winner?: number | null;
  forced_stop?: boolean;
  /** `DECK_PEEKED` 的私有牌顶（仅 viewer 自己时后端才下发） */
  cards?: unknown[];
  /** 反制符**反弹**（新规则，INTERFACES A13）：`COUNTER_USED` / `CARD_STOLEN` 上出现 */
  redirected?: boolean;
  /** 反弹时是否真的夺到牌 */
  stolen?: boolean;
  /** 后端未来新增字段（前向兼容） */
  [key: string]: unknown;
}

export interface GameEvent {
  /** 同一响应内严格递增，前端按 seq 顺序播放动画 */
  seq: number;
  type: GameEventType;
  /** 动作发起者 / 事件主体；系统事件为 null。
   *  注意 `PLAYER_ELIMINATED` 把**被淘汰的座位**放在这里（不是 target）。 */
  actor?: number | null;
  /** 唯一的信息载体，见 `GameEventData` 的字段表 */
  data?: GameEventData | null;
}

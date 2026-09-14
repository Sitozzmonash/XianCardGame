/**
 * 对局视图与动作类型 —— 逐字段对齐 API_CONTRACT.md §3/§6/§7/§8/§9/§10/§11/§12。
 * 后端是唯一规则权威：前端只渲染 view.legal_actions 并回传 action.id + payload。
 */
import type {
  AgentSpec,
  CardInstance,
  CardSpec,
  KnownTopCard,
  PrivateContext,
} from './card';
import type { GameEvent } from './event';

export type Phase = 'ACTION' | 'COUNTER' | 'REORDER' | 'REINSERT' | 'ENDED';

export type GameStatus = 'playing' | 'ended' | 'aborted' | string;

/** legal_actions[].type
 *  `ESCAPE` 是**规则改动新增**的反应动作（INTERFACES A13）：新规则下遁术只能在反制窗口打出，
 *  与 `COUNTER` / `PASS_COUNTER` 并列出现在同一窗口（旧规则里遁术是行动阶段的 `PLAY_CARD`）。 */
export type ActionType =
  | 'END_ACTION'
  | 'PLAY_CARD'
  | 'PLAY_CARD_TARGET'
  | 'COUNTER'
  | 'PASS_COUNTER'
  | 'ESCAPE'
  | 'REORDER_TOP'
  | 'REINSERT_TRIBULATION';

export type ReinsertRegion = 'TOP' | 'NEAR_TOP' | 'MIDDLE' | 'BOTTOM';

export const REINSERT_REGIONS: readonly ReinsertRegion[] = [
  'TOP',
  'NEAR_TOP',
  'MIDDLE',
  'BOTTOM',
] as const;

export interface EnumParam<T = string | number> {
  type: 'enum';
  options: T[];
}

export interface TokenOrderParam {
  type: 'token_order';
  /** 可选：后端若显式给出 token 列表，前端据此渲染 */
  options?: string[];
}

export interface ActionParams {
  target_player?: EnumParam<number>;
  region?: EnumParam<ReinsertRegion>;
  order?: TokenOrderParam;
  [key: string]: unknown;
}

/** API_CONTRACT §10：整个 API 最重要的数据 */
export interface LegalAction {
  id: string;
  type: ActionType;
  label: string;
  enabled?: boolean;
  card_instance_id?: string | null;
  params?: ActionParams | null;
}

/** POST /games/{id}/actions 的 payload：按动作类型给不同键 */
export interface ActionPayload {
  target_player?: number;
  order?: string[];
  region?: ReinsertRegion;
  [key: string]: unknown;
}

export interface SubmitActionRequest {
  revision: number;
  action_id: string;
  payload?: ActionPayload;
}

export interface Observation {
  hand: CardInstance[];
  known_top: KnownTopCard[];
  actions_used: number;
  max_actions_per_turn: number;
  private_context: PrivateContext | null;
}

/** API_CONTRACT §8：严禁包含真实手牌 / 私有观星结果 */
export interface PlayerPublicView {
  player_id: number;
  name: string;
  alive: boolean;
  hand_count: number;
  is_current: boolean;
  is_decision_player: boolean;
  agent?: AgentSpec | null;
  avatar?: string | null;
}

export interface PublicState {
  round: number;
  deck_count: number;
  discard_count: number;
  players: PlayerPublicView[];
  /** 契约未固定，后端可给：弃牌堆最上一张 / 当前回合数 */
  last_discard?: string | null;
  turn_no?: number;
}

/** API_CONTRACT §7：创建 / 读取 / 执行动作统一返回 GameView */
export interface GameView {
  game_id: string;
  status: GameStatus;
  revision: number;
  viewer_player_id: number;
  phase: Phase;
  current_player: number;
  decision_player: number;
  observation: Observation;
  public: PublicState;
  legal_actions: LegalAction[];
  events: GameEvent[];
  /** 以下为后端可选补充字段 */
  winner?: number | null;
  forced_stop?: boolean;
  created_at?: string;
  error?: string | null;
}

/** POST /games */
export interface CreateGameRequest {
  players: number;
  human_player: number;
  agents: (AgentSpec | null)[];
  seed?: number | null;
}

export interface CreateGameResponse {
  game_id: string;
  player_id: number;
  state: GameView;
}

export interface HealthResponse {
  status: string;
  version: string;
}

/** GET /cards（API_CONTRACT §18） */
export interface CardsResponse {
  cards: CardSpec[];
}

/** DELETE /games/{id} */
export interface DeleteGameResponse {
  ok: boolean;
}

/** GET /health 之外的通用错误体（API_CONTRACT §3） */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown> | null;
  };
}

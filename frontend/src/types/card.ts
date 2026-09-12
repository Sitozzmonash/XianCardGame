/**
 * 卡牌相关类型 —— 字段与 INTERFACES.md §1.1/§1.6/§1.7、API_CONTRACT.md §9/§18 逐字段对齐。
 */

/** 8 张核心牌的 API card_id（冻结，INTERFACES §1.7） */
export type CardId =
  | 'TRIBULATION'
  | 'DEFUSE'
  | 'STARGAZING'
  | 'REWRITE_FATE'
  | 'SHUFFLE'
  | 'ESCAPE'
  | 'STEAL'
  | 'COUNTER';

export type CardCategory = 'TRIBULATION' | 'DEFUSE' | 'ACTIVE' | 'REACTIVE';

/** GET /cards 的元素（也用作本地静态兜底） */
export interface CardSpec {
  id: string;
  /** 中文名，如「观星术」（Card.value） */
  name: string;
  category: CardCategory;
  description: string;
  /** 前端资源名，小写下划线，如 "stargazing" */
  asset: string;
}

/** observation.hand 的每一项 */
export interface CardInstance {
  instance_id: string;
  card_id: string;
  name: string;
}

/** observation.known_top 的每一项（仅 viewer 真正知道的牌顶） */
export interface KnownTopCard {
  position: number;
  card_id: string;
  name?: string;
}

/** observation.private_context.cards 的每一项（REORDER 阶段，token 不暴露内部索引） */
export interface PrivateCardToken {
  token: string;
  card_id: string;
  name?: string;
}

export interface PrivateContext {
  cards: PrivateCardToken[];
}

export interface AgentSpec {
  type: string;
  simulations?: number;
  exploration?: number;
  max_depth?: number;
  model?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  type: string;
  configurable?: boolean;
  model?: string;
  defaults?: { simulations?: number; exploration?: number; max_depth?: number };
}

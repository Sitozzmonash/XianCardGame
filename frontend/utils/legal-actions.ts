/**
 * legal_actions 派生工具。
 *
 * 铁律 1：前端**绝不**判断「这张牌能不能出」——
 * 这里所有函数的输入都只有后端给的 legal_actions，输出只是「把动作按 UI 需要分组」。
 * 没有对应 legal action 的卡牌一律返回 undefined / 'disabled'。
 */

import type { GameView, LegalAction } from '@/types/game';

export type CardVisualState = 'idle' | 'playable' | 'selected' | 'disabled';

/** 该手牌实例对应的所有动作（PLAY_CARD 一条，PLAY_CARD_TARGET 每个目标一条）
 *
 * ⚠️ 同名多张牌的坑（实测发现）：后端的动作空间是**按牌类型**生成的
 * （参考实现 `legal_actions()` 就是 `if Card.PEEK in hand` 这种类型判断，本仓引擎保持一致），
 * 所以手里有两张「观星术」时，`legal_actions` 里只有**一条** PLAY_CARD，
 * 其 `card_instance_id` 指向第一个匹配实例（h_0_2），第二张（h_0_4）在动作里根本不出现。
 * 若严格按 instance_id 匹配，UI 会把第二张误标成「✕ 不可用」——但它其实是可打的
 * （先打掉第一张，动作会自动指向剩下那张）。
 *
 * 因此这里的兜底：查不到精确匹配时，**按 card_id 找同类型实例上的动作**。
 * 这仍然完全由 legal_actions 派生（引擎是类型级动作，同类型实例等价），不复制任何规则。
 */
export function actionsForCard(view: GameView | undefined, instanceId: string): LegalAction[] {
  if (!view) return [];
  const exact = view.legal_actions.filter(
    (action) => action.card_instance_id === instanceId && action.enabled !== false,
  );
  if (exact.length > 0) return exact;

  const hand = view.observation.hand;
  const cardId = hand.find((card) => card.instance_id === instanceId)?.card_id;
  if (!cardId) return [];
  const siblings = new Set(
    hand.filter((card) => card.card_id === cardId).map((card) => card.instance_id),
  );
  return view.legal_actions.filter(
    (action) =>
      !!action.card_instance_id &&
      siblings.has(action.card_instance_id) &&
      action.enabled !== false,
  );
}

/** 直接可执行（不需要再选目标）的动作 */
export function directActionForCard(
  view: GameView | undefined,
  instanceId: string,
): LegalAction | undefined {
  return actionsForCard(view, instanceId).find((action) => action.type === 'PLAY_CARD');
}

/** 需要选目标（摄物术）的动作集合 */
export function targetActionsForCard(
  view: GameView | undefined,
  instanceId: string,
): LegalAction[] {
  return actionsForCard(view, instanceId).filter((action) => action.type === 'PLAY_CARD_TARGET');
}

export function cardVisualState(
  view: GameView | undefined,
  instanceId: string,
  isSelected: boolean,
): CardVisualState {
  if (isSelected) return 'selected';
  const actions = actionsForCard(view, instanceId);
  if (actions.length === 0) return 'disabled';
  return 'playable';
}

/** 不与某张手牌绑定的动作：结束行动 / 反制 / 不反制 / 排序 / 回插 */
export function nonCardActions(view: GameView | undefined): LegalAction[] {
  if (!view) return [];
  return view.legal_actions.filter(
    (action) => !action.card_instance_id && action.enabled !== false,
  );
}

export function counterActions(view: GameView | undefined): {
  use?: LegalAction;
  pass?: LegalAction;
} {
  if (!view) return {};
  const actions = view.legal_actions.filter((action) => action.enabled !== false);
  return {
    use: actions.find((action) => action.type === 'COUNTER'),
    pass: actions.find((action) => action.type === 'PASS_COUNTER'),
  };
}

export function reorderAction(view: GameView | undefined): LegalAction | undefined {
  return view?.legal_actions.find((action) => action.type === 'REORDER_TOP');
}

export function reinsertActions(view: GameView | undefined): LegalAction[] {
  if (!view) return [];
  return view.legal_actions.filter((action) => action.type === 'REINSERT_TRIBULATION');
}

export function reinsertActionForRegion(
  view: GameView | undefined,
  region: string,
): LegalAction | undefined {
  return reinsertActions(view).find((action) =>
    (action.params?.region?.options ?? []).includes(region as never),
  );
}

/** 选目标动作 → 该动作允许的目标 id 列表 */
export function targetOptions(action: LegalAction | undefined): number[] {
  return action?.params?.target_player?.options ?? [];
}

export function targetActionFor(
  view: GameView | undefined,
  cardInstanceId: string,
  targetPlayerId: number,
): LegalAction | undefined {
  return targetActionsForCard(view, cardInstanceId).find((action) =>
    targetOptions(action).includes(targetPlayerId),
  );
}

/** 是否是「等待别人决策」的局面（用于显示等待提示，而不是假装能操作） */
export function isWaitingForOthers(view: GameView | undefined): boolean {
  if (!view) return false;
  if (view.status === 'ended' || view.phase === 'ENDED') return false;
  return view.decision_player !== view.viewer_player_id;
}

export function isHumanDeciding(view: GameView | undefined): boolean {
  if (!view) return false;
  if (view.status === 'ended' || view.phase === 'ENDED') return false;
  return view.decision_player === view.viewer_player_id;
}

export function playerNameOf(view: GameView | undefined, playerId: number | null | undefined): string {
  if (playerId === null || playerId === undefined || playerId < 0) return '天机';
  const found = view?.public.players.find((player) => player.player_id === playerId);
  return found?.name ?? `P${playerId}`;
}

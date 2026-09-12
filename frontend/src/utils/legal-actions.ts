/**
 * legal_actions 派生工具。
 *
 * 铁律 1：前端**绝不**判断「这张牌能不能出」——
 * 这里所有函数的输入都只有后端给的 legal_actions，输出只是「把动作按 UI 需要分组」。
 * 没有对应 legal action 的卡牌一律返回 undefined / 'disabled'。
 */

import type { GameView, LegalAction } from '@/types/game';

export type CardVisualState = 'idle' | 'playable' | 'selected' | 'disabled';

/** 该手牌实例对应的所有动作（PLAY_CARD 一条，PLAY_CARD_TARGET 每个目标一条） */
export function actionsForCard(view: GameView | undefined, instanceId: string): LegalAction[] {
  if (!view) return [];
  return view.legal_actions.filter(
    (action) => action.card_instance_id === instanceId && action.enabled !== false,
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

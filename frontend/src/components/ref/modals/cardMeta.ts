/**
 * 弹窗需要的**展示字段**兜底表。
 *
 * 后端 `GET /cards`（`CardSpec`）只下发 id / name / category / description / asset，
 * 没有参考原型卡面上的 `subtitle`（如「秘术 · 逆天级」）。参考的排序弹窗行内要显示它
 * （`RewriteFateModal.tsx` 第 83 行 `{card.subtitle}`），因此在**本目录**维护一份展示映射，
 * 而不是去改冻结的 `src/utils/card-catalog.ts`。
 *
 * 取值逐条抄自参考原型 `docs/reference-next/lib/game-data.ts` 的 `subtitle`（8 张牌，一 一对应）。
 * 牌名 / 效果文案仍以 `@/utils/card-catalog` 的 `cardSpecOf()` 为准（它会优先用后端 /cards 的值）。
 */

import { cardSpecOf } from '@/utils/card-catalog';

export const CARD_SUBTITLE: Record<string, string> = {
  TRIBULATION: '天劫 · 劫数',
  DEFUSE: '符箓 · 护身',
  STARGAZING: '秘术 · 观星',
  REWRITE_FATE: '秘术 · 逆天级',
  SHUFFLE: '秘术 · 扰乱',
  ESCAPE: '秘术 · 遁走',
  STEAL: '秘术 · 摄物',
  COUNTER: '符箓 · 反制',
};

export function cardSubtitleOf(cardId: string | null | undefined): string | undefined {
  if (!cardId) return undefined;
  return CARD_SUBTITLE[cardId];
}

/** 弹窗标题用的牌名：优先后端手牌下发的 `name`，其次本地卡表 */
export function cardNameOf(cardId: string | null | undefined, fallbackName?: string): string {
  if (fallbackName && fallbackName.length > 0) return fallbackName;
  return cardSpecOf(cardId)?.name ?? (cardId ? String(cardId) : '未知牌');
}

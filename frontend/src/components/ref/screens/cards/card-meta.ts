/**
 * 「卡牌图鉴 / 卡牌详情」两屏的**展示元数据与类目映射**。
 *
 * 数据分工（不得混淆）：
 *  - 卡牌 `id` / 中文名 / `category` / 效果描述 / `asset`：**后端 `GET /cards` 是唯一权威**，
 *    本文件不复制这些字段，只在 `toCatalogCard()` 里做展示层拼装；
 *  - `subtitle`（副标题）/ `flavor`（引语）/ `rarity`（品质标签）：后端没有这三个字段，
 *    逐字照抄**参考原型** `docs/reference-next/lib/game-data.ts` 的 `CARDS` 数组（第 32–113 行，8 张牌），
 *    仅用于展示文案，**不参与任何规则判定**；
 *  - 类别中文映射：后端 `category` 只有 `ACTIVE / DEFUSE / TRIBULATION / REACTIVE` 四种，
 *    而参考图鉴的筛选是「全部 / 主动 / 防御 / 天劫」三个桶，因此 `DEFUSE` 与 `REACTIVE`
 *    都归「防御」（护劫符、反制符都是防御性符箓）。**`ESCAPE`（遁术）在后端是 `ACTIVE`，
 *    因此归「主动」** —— 一切以 `GET /cards` 的 `category` 为准，前端不自创规则。
 */

import type { CardSpec } from '@/types/card';

/** 参考图鉴的三个筛选桶（不含「全部」） */
export type CardBucket = 'active' | 'defense' | 'tribulation';

/** 参考 `CollectionScreen.tsx` 第 9/11 行的 `Filter` 与 `FILTERS` */
export type CardFilter = 'all' | CardBucket;

export const CARD_FILTERS: readonly CardFilter[] = ['all', 'active', 'defense', 'tribulation'];

/** 参考 `game-data.ts` 第 26–30 行的 `CARD_CATEGORY_LABEL`（此处按后端 category 归桶后取标签） */
export const CARD_FILTER_LABEL: Record<CardFilter, string> = {
  all: '全部',
  active: '主动',
  defense: '防御',
  tribulation: '天劫',
};

/** 后端 `category` → 参考图鉴的筛选桶（4 → 3 收敛，见文件头说明） */
const CATEGORY_BUCKET: Record<string, CardBucket> = {
  TRIBULATION: 'tribulation',
  DEFUSE: 'defense',
  REACTIVE: 'defense',
  ACTIVE: 'active',
};

/** 取筛选桶；遇到后端新增的未知 category 时归入「主动」（保守兜底，不新造类目） */
export function bucketOf(category: string): CardBucket {
  return CATEGORY_BUCKET[category] ?? 'active';
}

/** 类别标签（详情页第一个 `StatusTag`）：已知类目给中文标签，未知类目原样展示后端值 */
export function categoryLabelOf(category: string): string {
  return CATEGORY_BUCKET[category] ? CARD_FILTER_LABEL[bucketOf(category)] : category;
}

export interface CardShowcase {
  /** 副标题，例 `秘术 · 观星`（参考原型 `game-data.ts` 的 `subtitle`） */
  subtitle: string;
  /** 引语，例 `「天命虽定，亦可改之。」`（参考原型 `game-data.ts` 的 `flavor`） */
  flavor: string;
  /** 品质标签，例 `良` / `珍` / `劫`（参考原型 `game-data.ts` 的 `rarity`） */
  rarity: string;
}

/** 参考原型 `CARDS` 的 `subtitle` / `flavor` / `rarity`，按后端 `card_id` 索引 */
export const CARD_SHOWCASE: Record<string, CardShowcase> = {
  TRIBULATION: { subtitle: '天劫 · 劫数', flavor: '「天威不可测，唯道心可渡。」', rarity: '劫' },
  DEFUSE: { subtitle: '符箓 · 护身', flavor: '「一符护身，可挡天威三分。」', rarity: '珍' },
  STARGAZING: { subtitle: '秘术 · 观星', flavor: '「天命虽定，亦可改之。」', rarity: '良' },
  REWRITE_FATE: { subtitle: '秘术 · 逆天级', flavor: '「天命虽定，亦可改之。」', rarity: '珍' },
  SHUFFLE: { subtitle: '秘术 · 扰乱', flavor: '「机不可泄，乱之则安。」', rarity: '良' },
  ESCAPE: { subtitle: '秘术 · 遁走', flavor: '「身化清风，遁于无形。」', rarity: '良' },
  STEAL: { subtitle: '秘术 · 摄物', flavor: '「隔空取物，如探囊中。」', rarity: '良' },
  COUNTER: { subtitle: '符箓 · 反制', flavor: '「以彼之道，还施彼身。」', rarity: '珍' },
};

/** 后端 `GET /cards` 的一张牌 + 参考原型的展示元数据 */
export interface CatalogCard extends CardSpec {
  subtitle?: string;
  flavor?: string;
  rarity?: string;
  /** 筛选桶（由后端 `category` 推导） */
  filter: CardBucket;
}

/** `GET /cards` 的元素 → 页面用卡牌对象（后端字段逐字保留） */
export function toCatalogCard(spec: CardSpec): CatalogCard {
  const meta = CARD_SHOWCASE[spec.id];
  return {
    ...spec,
    subtitle: meta?.subtitle,
    flavor: meta?.flavor,
    rarity: meta?.rarity,
    filter: bucketOf(spec.category),
  };
}

/** 参考 `CollectionScreen.tsx` 第 21 行的筛选逻辑 */
export function filterCards(cards: CatalogCard[], filter: CardFilter): CatalogCard[] {
  return filter === 'all' ? cards : cards.filter((card) => card.filter === filter);
}

/** 参考 `CardDetailScreen.tsx` 第 20 行：其余卡牌取前 4 张（不按类目过滤） */
export function relatedCards(cards: CatalogCard[], card: CatalogCard, limit = 4): CatalogCard[] {
  return cards.filter((item) => item.id !== card.id).slice(0, limit);
}

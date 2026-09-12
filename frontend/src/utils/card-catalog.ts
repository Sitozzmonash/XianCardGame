/**
 * 本地静态卡表兜底（INTERFACES.md §1.7 冻结映射）。
 * 用途：
 *  1) GET /cards 不可用（后端未就绪 / 网络失败）时 cards 页仍有内容；
 *  2) 手牌只给 card_id 时补中文名。
 * 后端返回的 cards 优先，本表仅在缺失时使用。
 */
import type { CardId, CardSpec } from '@/types/card';

export const CARD_SPECS_FALLBACK: CardSpec[] = [
  {
    id: 'TRIBULATION',
    name: '天劫',
    category: 'TRIBULATION',
    description: '抽到天劫时，若手中无护劫符则立即淘汰，退出本局。',
    asset: 'tribulation',
  },
  {
    id: 'DEFUSE',
    name: '护劫符',
    category: 'DEFUSE',
    description: '抵挡一次天劫；化解后须把天劫回插牌堆（顶 / 近顶 / 中 / 底）。',
    asset: 'defuse',
  },
  {
    id: 'STARGAZING',
    name: '观星术',
    category: 'ACTIVE',
    description: '查看牌堆顶部最多 3 张牌，只有自己知道内容。',
    asset: 'stargazing',
  },
  {
    id: 'REWRITE_FATE',
    name: '逆天改命',
    category: 'ACTIVE',
    description: '查看牌堆顶若干张并重新排列其顺序。',
    asset: 'rewrite_fate',
  },
  {
    id: 'SHUFFLE',
    name: '扰乱天机',
    category: 'ACTIVE',
    description: '洗牌，清除所有玩家已掌握的牌顶信息。',
    asset: 'shuffle',
  },
  {
    id: 'ESCAPE',
    name: '遁术',
    category: 'ACTIVE',
    description: '结束当前行动，跳过本次抽牌。',
    asset: 'escape',
  },
  {
    id: 'STEAL',
    name: '摄物术',
    category: 'ACTIVE',
    description: '随机夺取一名其他玩家的一张手牌。',
    asset: 'steal',
  },
  {
    id: 'COUNTER',
    name: '反制符',
    category: 'REACTIVE',
    description: '在他人对你使用主动牌时打出，使该效果无效。',
    asset: 'counter',
  },
];

export const CARD_SPEC_BY_ID: Record<string, CardSpec> = CARD_SPECS_FALLBACK.reduce<
  Record<string, CardSpec>
>((acc, spec) => {
  acc[spec.id] = spec;
  return acc;
}, {});

export function cardSpecOf(cardId: string | null | undefined): CardSpec | undefined {
  if (!cardId) return undefined;
  return CARD_SPEC_BY_ID[cardId];
}

export function cardNameOf(cardId: string | null | undefined): string {
  return cardSpecOf(cardId)?.name ?? (cardId ? String(cardId) : '未知牌');
}

export function cardAssetOf(cardId: string | null | undefined): string {
  return cardSpecOf(cardId)?.asset ?? 'unknown';
}

/** 中文区域名（天劫回插） */
export const REGION_LABELS: Record<string, string> = {
  TOP: '牌堆顶',
  NEAR_TOP: '近顶',
  MIDDLE: '牌堆中',
  BOTTOM: '牌堆底',
};

export const REGION_HINTS: Record<string, string> = {
  TOP: '下一位玩家立刻抽到，最凶险',
  NEAR_TOP: '很快再被抽到，风险偏高',
  MIDDLE: '暂时安全，靠运气躲过',
  BOTTOM: '本局基本不会再出现',
};

/** 牌类中文名的**唯一来源**（card-detail/card-visuals.ts 直接复用本表）。
 *  DEFUSE 用「护劫符」（= 后端真实牌名 / CARD_SPECS_FALLBACK 的 name），不是「护劫」。 */
export const CATEGORY_LABELS: Record<string, string> = {
  TRIBULATION: '天劫',
  DEFUSE: '护劫符',
  ACTIVE: '主动',
  REACTIVE: '反制',
};

/** 供 UI 画卡面纹样：每张牌一个字符 */
export const CARD_GLYPHS: Record<CardId | string, string> = {
  TRIBULATION: '劫',
  DEFUSE: '符',
  STARGAZING: '观',
  REWRITE_FATE: '改',
  SHUFFLE: '乱',
  ESCAPE: '遁',
  STEAL: '摄',
  COUNTER: '反',
};

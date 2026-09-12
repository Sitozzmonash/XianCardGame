/**
 * 「卡牌详情」屏的视觉常量与设计图裁切资源映射。
 *
 * 几何全部来自 `images/figma/fig3_2.png`（2x，860×1864）的像素实测，
 * 已换算成 1x（430×932）坐标；详见 `docs/design_measurements.md`。
 * 插画 / 徽记从 2x 原图裁切，存于 `assets/design_crops/`（不打包整张设计图）。
 */
import type { ImageSourcePropType } from 'react-native';

import type { CardCategory } from '@/types/card';
import { CATEGORY_LABELS } from '@/utils/card-catalog';

/** 大卡面（1x 设计值）：外框 x 95-334.5 / y 108-448；米黄内区 234×334 */
export const CARD_FACE = {
  /** 外框宽（含 3px 金色描边） */
  width: 240,
  /** 金色描边厚度（设计 y 108-110.5） */
  frame: 3,
  /** 米黄内区尺寸 = width-frame*2 × height-frame*2 */
  innerWidth: 234,
  innerHeight: 334,
  radius: 14,
  /** 卡面内边距（卡面内元素左右各内缩） */
  pad: 9,
  /** 类型符点（圆点）直径：设计 y 120-151，x 107-139 */
  dot: 32,
  /** 卡名基线行：设计 y 127.5-145.5 */
  nameTop: 16.5,
  nameSize: 19,
  /** 插画：设计 y 165-340，x 107-322.5（约 216×175） */
  artTop: 54,
  artHeight: 175,
  artRadius: 8,
  /** 卡面底部类型行：设计 y 358-372.5，左对齐 x 107.5 */
  typeTop: 247,
  typeSize: 12.5,
} as const;

/** 效果说明面板（1x 设计值）：x 25-405 / y 473-592，金线 y 472 / 592 */
export const EFFECT_PANEL = {
  marginH: 25,
  height: 119,
  radius: 6,
  pad: 17,
  titleSize: 14,
  bodySize: 14,
  quoteSize: 13.5,
} as const;

/** 按钮行（1x 设计值）：y 826-869，次按钮 x 25-205、主按钮 x 221-405 */
export const DETAIL_ACTIONS = {
  height: 43,
  radius: 8,
  gap: 16,
  marginH: 25,
} as const;

/** 相关卡牌小卡（1x 设计值）：y 766-811，每张宽 87.5、间距 10 */
export const RELATED_CARD = {
  width: 87.5,
  height: 45,
  gap: 10,
  radius: 6,
  nameSize: 10,
  nameBarHeight: 13,
} as const;

/**
 * 类型中文名（DESIGN_SPEC §3.4/§4：显示真实 category，不显示「秘术·逆天级」这类设计稿文案）。
 * **单一来源**：直接复用 `@/utils/card-catalog` 的 CATEGORY_LABELS，避免「护劫」/「护劫符」
 * 这类同名异写再次分叉（DEFUSE 的真实牌名是「护劫符」）。
 */
export const CARD_TYPE_LABELS: Record<CardCategory, string> = {
  ACTIVE: CATEGORY_LABELS.ACTIVE,
  REACTIVE: CATEGORY_LABELS.REACTIVE,
  TRIBULATION: CATEGORY_LABELS.TRIBULATION,
  DEFUSE: CATEGORY_LABELS.DEFUSE,
};

/** 类型符点里的字（替代设计稿的「1费/2费」费用位，DESIGN_SPEC §4） */
export const CARD_TYPE_GLYPHS: Record<CardCategory, string> = {
  ACTIVE: '主',
  REACTIVE: '反',
  TRIBULATION: '劫',
  DEFUSE: '护',
};

/** 类型符点底色（取色板内已有 token，不新造颜色） */
export const CARD_TYPE_TINTS: Record<CardCategory, string> = {
  ACTIVE: 'rgba(78,178,148,0.92)',
  REACTIVE: 'rgba(190,161,68,0.92)',
  TRIBULATION: 'rgba(164,66,61,0.92)',
  DEFUSE: 'rgba(52,132,112,0.92)',
};

/**
 * 设计图裁切的插画（2x 原图 → assets/design_crops/）。
 * 只有设计稿里出现过的 5 张牌有真实裁切，其余用「渐变 + 符箓」占位（DESIGN_SPEC §6）。
 */
export const CARD_ART: Record<string, ImageSourcePropType> = {
  REWRITE_FATE: require('../../../assets/design_crops/card_art_rewrite_fate.png'),
  DEFUSE: require('../../../assets/design_crops/card_thumb_defuse.png'),
  STARGAZING: require('../../../assets/design_crops/card_thumb_stargazing.png'),
  ESCAPE: require('../../../assets/design_crops/card_thumb_escape.png'),
  STEAL: require('../../../assets/design_crops/card_thumb_steal.png'),
};

/**
 * 卡牌引语。**只保留设计稿里真实出现过的一句**（fig3_2 的「逆天改命」），
 * 其余牌没有权威来源，因此不编造：没有条目就不渲染引语行。
 */
export const CARD_QUOTES: Record<string, string> = {
  REWRITE_FATE: '天命虽定，亦可改之。',
};

export function cardArtOf(cardId: string | null | undefined): ImageSourcePropType | undefined {
  if (!cardId) return undefined;
  return CARD_ART[cardId];
}

export function cardQuoteOf(cardId: string | null | undefined): string | undefined {
  if (!cardId) return undefined;
  return CARD_QUOTES[cardId];
}

export function typeLabelOf(category: CardCategory | string | null | undefined): string {
  const key = (category ?? 'ACTIVE') as CardCategory;
  return CARD_TYPE_LABELS[key] ?? String(category ?? '主动');
}

export function typeGlyphOf(category: CardCategory | string | null | undefined): string {
  const key = (category ?? 'ACTIVE') as CardCategory;
  return CARD_TYPE_GLYPHS[key] ?? '符';
}

export function typeTintOf(category: CardCategory | string | null | undefined): string {
  const key = (category ?? 'ACTIVE') as CardCategory;
  return CARD_TYPE_TINTS[key] ?? CARD_TYPE_TINTS.ACTIVE;
}

/** 「相关卡牌」：真实映射 —— 同 category 的其他牌（来自 GET /cards），最多 4 张 */
export function relatedCardsOf<T extends { id: string; category: CardCategory }>(
  all: T[],
  card: { id: string; category: CardCategory },
  limit = 4,
): T[] {
  return all.filter((item) => item.id !== card.id && item.category === card.category).slice(0, limit);
}

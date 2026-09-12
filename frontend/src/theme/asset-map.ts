/**
 * 对局页（fig3_1）资产映射 —— **唯一改动点**。
 *
 * 设计原图里的插画是位图，我们没有源文件，因此按 DESIGN_SPEC §6 的做法：
 * 从 2x 设计图 `images/figma/fig3_1.png`（860×1864）裁切，存到 `assets/design_crops/`。
 * 换正式美术时**只改本文件**，页面与组件不需要动。
 *
 * 裁切来源（2x 像素坐标，1x = 除以 2）：
 * | 资产 | 设计图卡位(2x x) | 裁切框(2x) | 对应卡 |
 * |---|---|---|---|
 * | battle_art_defuse.png       | 48-188   | (54,1456)-(182,1576)   | 护劫符 DEFUSE |
 * | battle_art_stargazing.png   | 204-344  | (210,1456)-(338,1576)  | 观星术 STARGAZING |
 * | battle_art_rewrite_fate.png | 358-500  | (364,1456)-(494,1576)  | 逆天改命 REWRITE_FATE |
 * | battle_art_escape.png       | 516-656  | (522,1456)-(650,1576)  | 遁术 ESCAPE |
 * | battle_art_steal.png        | 672-812  | (678,1456)-(806,1576)  | 摄物术 STEAL |
 * | battle_avatar_1.png         | 左侧对手面板头像区 | (44,196)-(132,304)  | 对手 1 / 我 |
 * | battle_avatar_2.png         | 右侧对手面板头像区 | (630,196)-(718,304) | 对手 2 |
 *
 * 卡名与插画的对应关系是**实测**过的：把 5 张卡的卡名牌（1x y786-816）裁出放大后逐张读出
 * 护劫符 / 观星术 / 逆天改命 / 遁术 / 摄物术，再与插画一一对应。
 * 设计图手牌里**没有**天劫 / 扰乱天机 / 反制符三张牌的插画，因此这三张走
 * `proceduralArtOf()` 的「渐变 + 符箓纹 + 印章字」占位（DESIGN_SPEC §6 明确允许，不留白框）。
 */
import type { ImageSourcePropType } from 'react-native';

/** 设计图裁切插画（按 API card_id 索引） */
export const battleArt: Record<string, ImageSourcePropType> = {
  DEFUSE: require('../../assets/design_crops/battle_art_defuse.png') as ImageSourcePropType,
  STARGAZING: require('../../assets/design_crops/battle_art_stargazing.png') as ImageSourcePropType,
  REWRITE_FATE: require('../../assets/design_crops/battle_art_rewrite_fate.png') as ImageSourcePropType,
  ESCAPE: require('../../assets/design_crops/battle_art_escape.png') as ImageSourcePropType,
  STEAL: require('../../assets/design_crops/battle_art_steal.png') as ImageSourcePropType,
};

/** 对手 / 本人头像（设计图裁切；按稳定序号轮转，不暴露任何隐藏信息） */
export const battleAvatars: readonly ImageSourcePropType[] = [
  require('../../assets/design_crops/battle_avatar_1.png') as ImageSourcePropType,
  require('../../assets/design_crops/battle_avatar_2.png') as ImageSourcePropType,
];

/** 没有裁切插画的卡：程序化占位风格 */
export interface ProceduralArt {
  /** 渐变色（从深到浅） */
  gradient: readonly [string, string, string];
  /** 印章式大字 */
  glyph: string;
}

export const proceduralArt: Record<string, ProceduralArt> = {
  TRIBULATION: { gradient: ['#1B0A09', '#5A211C', '#A4423D'], glyph: '劫' },
  SHUFFLE: { gradient: ['#06201F', '#12474A', '#348470'], glyph: '乱' },
  COUNTER: { gradient: ['#241A05', '#6B5620', '#C9A65A'], glyph: '反' },
};

export const DEFAULT_PROCEDURAL_ART: ProceduralArt = {
  gradient: ['#0B1C22', '#1C3B47', '#345D6B'],
  glyph: '符',
};

export function battleArtFor(cardId: string | null | undefined): ImageSourcePropType | undefined {
  if (!cardId) return undefined;
  return battleArt[cardId];
}

export function proceduralArtOf(cardId: string | null | undefined): ProceduralArt {
  if (!cardId) return DEFAULT_PROCEDURAL_ART;
  return proceduralArt[cardId] ?? DEFAULT_PROCEDURAL_ART;
}

/** 头像轮转：只依赖公开的 player_id，稳定且不泄漏信息 */
export function battleAvatarFor(playerId: number): ImageSourcePropType {
  const index = ((playerId % battleAvatars.length) + battleAvatars.length) % battleAvatars.length;
  return battleAvatars[index];
}

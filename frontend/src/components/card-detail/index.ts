/**
 * 「卡牌详情 / 卡牌图鉴」组件（fig3_2 1:1 还原）。
 * 几何来自 docs/design_measurements.md 的像素实测；插画来自 assets/design_crops/。
 */
export { CardFace } from './CardFace';
export { CardDetailView } from './CardDetailView';
export type { PrimaryAction } from './CardDetailView';
export { RelatedCards } from './RelatedCards';
export { NightStage } from './NightStage';
export {
  CARD_ART,
  CARD_FACE,
  CARD_QUOTES,
  CARD_TYPE_GLYPHS,
  CARD_TYPE_LABELS,
  DETAIL_ACTIONS,
  EFFECT_PANEL,
  RELATED_CARD,
  cardArtOf,
  cardQuoteOf,
  relatedCardsOf,
  typeGlyphOf,
  typeLabelOf,
  typeTintOf,
} from './card-visuals';

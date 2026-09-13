/** 「卡牌图鉴 / 卡牌详情」两屏（参考原型 1:1 移植）的对外出口 */
export { CollectionScreen, type CollectionScreenProps } from './CollectionScreen';
export { CardDetailScreen, type CardDetailScreenProps } from './CardDetailScreen';
export { CatalogError, CatalogLoading, CatalogNotice } from './catalog-status';
export { useCardCatalog, type CardCatalog, type CatalogErrorInfo } from './use-card-catalog';
export {
  CARD_FILTERS,
  CARD_FILTER_LABEL,
  CARD_SHOWCASE,
  bucketOf,
  categoryLabelOf,
  filterCards,
  relatedCards,
  toCatalogCard,
  type CardBucket,
  type CardFilter,
  type CardShowcase,
  type CatalogCard,
} from './card-meta';

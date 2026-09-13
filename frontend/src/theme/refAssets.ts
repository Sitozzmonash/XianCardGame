/**
 * 参考原型的资产映射（`public/cards/*.png` + `public/hero-cultivator.png`）。
 *
 * 键用**后端 `GET /cards` 的卡牌 id**（CardSpec.id），与 `GameView.observation.hand[].card_id` 一致，
 * 这样 UI 不需要维护第二套命名。换美术只改本文件。
 */

/** 8 张牌的立绘（原图 1024²，仓库里存 512² 优化版） */
export const CARD_ART: Record<string, number> = {
  TRIBULATION: require('../../assets/ref/cards/tianjie.png'),
  DEFUSE: require('../../assets/ref/cards/hujiefu.png'),
  STARGAZING: require('../../assets/ref/cards/guanxingshu.png'),
  REWRITE_FATE: require('../../assets/ref/cards/nitiangaiming.png'),
  SHUFFLE: require('../../assets/ref/cards/raoluantianji.png'),
  ESCAPE: require('../../assets/ref/cards/dunshu.png'),
  STEAL: require('../../assets/ref/cards/shewushu.png'),
  COUNTER: require('../../assets/ref/cards/fanzhifu.png'),
};

/** 首页主角立绘（`hero-cultivator.png`，原图 1024²） */
export const HERO_ART: number = require('../../assets/ref/hero/hero-cultivator.png');

/** 取卡面；未知 id 返回 undefined（调用方用占位样式兜底，不编造美术） */
export function artOf(cardId: string | null | undefined): number | undefined {
  if (!cardId) return undefined;
  return CARD_ART[cardId];
}

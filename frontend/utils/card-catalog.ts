/**
 * 本地静态卡表兜底（INTERFACES.md §1.7 冻结映射）。
 * 用途：
 *  1) GET /cards 不可用（后端未就绪 / 网络失败）时 cards 页仍有内容；
 *  2) 手牌只给 card_id 时补中文名。
 * 后端返回的 cards 优先，本表仅在缺失时使用。
 *
 * ⚠️ **权威是后端 `game/cards.py` 的 `CARD_SPECS`（`GET /cards` 直接喂前端）**。
 *    本表是它的离线镜像，规则一改就必须同步更新——否则「后端不可达」时页面会展示旧规则文案
 *    （曾发生：遁术已改为反应牌，本表仍写「主动 · 结束当前行动，跳过本次抽牌」）。
 *    同步检查：`curl -s http://127.0.0.1:8000/api/v1/cards` 与下表逐条比对 description/category。
 */
import type { CardId, CardSpec } from '@/types/card';

export const CARD_SPECS_FALLBACK: CardSpec[] = [
  {
    id: 'TRIBULATION',
    name: '天劫',
    category: 'TRIBULATION',
    description: '抽到后必须渡劫；手中没有护劫符则立即淘汰。天劫不进入手牌。',
    asset: 'tribulation',
  },
  {
    id: 'DEFUSE',
    name: '护劫符',
    category: 'DEFUSE',
    description: '自动化解一次天劫，并把天劫秘密回插到牌堆的指定区域。',
    asset: 'defuse',
  },
  {
    id: 'STARGAZING',
    name: '观星术',
    category: 'ACTIVE',
    description: '查看牌堆顶部最多 3 张牌，并重新调整顺序。',
    asset: 'stargazing',
  },
  {
    id: 'REWRITE_FATE',
    name: '逆天改命',
    category: 'ACTIVE',
    description: '查看牌堆顶部最多 3 张牌，并重新调整它们的顺序，只有自己知道最终排序。',
    asset: 'rewrite_fate',
  },
  {
    id: 'SHUFFLE',
    name: '扰乱天机',
    category: 'ACTIVE',
    description: '重新洗牌，所有玩家此前获得的牌顶知识全部失效。',
    asset: 'shuffle',
  },
  {
    id: 'ESCAPE',
    name: '遁术',
    category: 'REACTIVE',
    description: '避开一次指向你的法术，并立即结束当前结算。',
    asset: 'escape',
  },
  {
    id: 'STEAL',
    name: '摄物术',
    category: 'ACTIVE',
    description: '指定另一名存活玩家，随机偷取对方 1 张手牌；目标可以使用反制符反弹或遁术避开。',
    asset: 'steal',
  },
  {
    id: 'COUNTER',
    name: '反制符',
    category: 'REACTIVE',
    description: '反制一次指向你的法术，令其效果转向施术者。',
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
 *  DEFUSE 用「护劫符」（= 后端真实牌名 / CARD_SPECS_FALLBACK 的 name），不是「护劫」。
 *  REACTIVE 用「防御」：新规则下反制符与遁术都是反应牌，与参考原型的筛选项一致
 *  （旧值「反制」在遁术归入 REACTIVE 后就不再准确了）。 */
export const CATEGORY_LABELS: Record<string, string> = {
  TRIBULATION: '天劫',
  DEFUSE: '护劫符',
  ACTIVE: '主动',
  REACTIVE: '防御',
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

export type CardCategory = 'active' | 'defense' | 'tribulation'

export type CardId =
  | 'tianjie'
  | 'hujiefu'
  | 'guanxingshu'
  | 'nitiangaiming'
  | 'raoluantianji'
  | 'dunshu'
  | 'shewushu'
  | 'fanzhifu'

export interface GameCardData {
  id: CardId
  name: string
  category: CardCategory
  /** Short label shown on the card face, e.g. 秘术 · 逆天级 */
  subtitle: string
  /** Rarity tag rendered in the corner of the detail view. */
  rarity: string
  effect: string
  flavor: string
  art: string
}

export const CARD_CATEGORY_LABEL: Record<CardCategory, string> = {
  active: '主动',
  defense: '防御',
  tribulation: '天劫',
}

export const CARDS: GameCardData[] = [
  {
    id: 'tianjie',
    name: '天劫',
    category: 'tribulation',
    subtitle: '天劫 · 劫数',
    rarity: '劫',
    effect: '天劫降临，所有未持有护劫符的修士将承受劫数。渡劫失败者道消身殒。',
    flavor: '「天威不可测，唯道心可渡。」',
    art: '/cards/tianjie.png',
  },
  {
    id: 'hujiefu',
    name: '护劫符',
    category: 'defense',
    subtitle: '符箓 · 护身',
    rarity: '珍',
    effect: '抵挡一次天劫。使用后需将天劫秘密回插至牌堆的指定位置。',
    flavor: '「一符护身，可挡天威三分。」',
    art: '/cards/hujiefu.png',
  },
  {
    id: 'guanxingshu',
    name: '观星术',
    category: 'active',
    subtitle: '秘术 · 观星',
    rarity: '良',
    effect: '查看牌堆顶部最多 3 张牌，并重新调整顺序。',
    flavor: '「天命虽定，亦可改之。」',
    art: '/cards/guanxingshu.png',
  },
  {
    id: 'nitiangaiming',
    name: '逆天改命',
    category: 'active',
    subtitle: '秘术 · 逆天级',
    rarity: '珍',
    effect: '查看牌堆顶部最多 3 张牌，并重新调整顺序。',
    flavor: '「天命虽定，亦可改之。」',
    art: '/cards/nitiangaiming.png',
  },
  {
    id: 'raoluantianji',
    name: '扰乱天机',
    category: 'active',
    subtitle: '秘术 · 扰乱',
    rarity: '良',
    effect: '打乱牌堆顶部的顺序，令天机不可窥探。',
    flavor: '「机不可泄，乱之则安。」',
    art: '/cards/raoluantianji.png',
  },
  {
    id: 'dunshu',
    name: '遁术',
    category: 'defense',
    subtitle: '秘术 · 遁走',
    rarity: '良',
    effect: '避开一次指向你的法术，并立即结束当前结算。',
    flavor: '「身化清风，遁于无形。」',
    art: '/cards/dunshu.png',
  },
  {
    id: 'shewushu',
    name: '摄物术',
    category: 'active',
    subtitle: '秘术 · 摄物',
    rarity: '良',
    effect: '选择一名存活修士，随机夺取其一张手牌。',
    flavor: '「隔空取物，如探囊中。」',
    art: '/cards/shewushu.png',
  },
  {
    id: 'fanzhifu',
    name: '反制符',
    category: 'defense',
    subtitle: '符箓 · 反制',
    rarity: '珍',
    effect: '反制一次指向你的法术，令其效果转向施术者。',
    flavor: '「以彼之道，还施彼身。」',
    art: '/cards/fanzhifu.png',
  },
]

export const CARD_BY_ID: Record<CardId, GameCardData> = CARDS.reduce(
  (acc, card) => {
    acc[card.id] = card
    return acc
  },
  {} as Record<CardId, GameCardData>,
)

export type AIKind = 'human' | 'random' | 'rule' | 'ismcts' | 'mccfr'

export const AI_LABEL: Record<AIKind, string> = {
  human: 'Human',
  random: 'Random',
  rule: 'Rule',
  ismcts: 'ISMCTS',
  mccfr: 'MCCFR',
}

export const AI_OPTIONS: AIKind[] = ['random', 'rule', 'ismcts', 'mccfr']

export interface Seat {
  id: string
  name: string
  title: string
  seat: number
  kind: AIKind
  handCount: number
  alive: boolean
  isSelf?: boolean
}

export const SELF_NAME = '太虚真君'

export const DEFAULT_SEATS: Seat[] = [
  { id: 'p0', name: '我', title: '玩家座位 · P0', seat: 0, kind: 'human', handCount: 5, alive: true, isSelf: true },
  { id: 'p1', name: '玄墨真人', title: 'P1 · AI', seat: 1, kind: 'rule', handCount: 4, alive: true },
  { id: 'p2', name: '清月仙子', title: 'P2 · AI', seat: 2, kind: 'ismcts', handCount: 6, alive: true },
  { id: 'p3', name: '赤霄散人', title: 'P3 · AI', seat: 3, kind: 'mccfr', handCount: 3, alive: true },
  { id: 'p4', name: '青岚道友', title: 'P4 · AI', seat: 4, kind: 'random', handCount: 5, alive: true },
  { id: 'p5', name: '白露剑仙', title: 'P5 · AI', seat: 5, kind: 'ismcts', handCount: 4, alive: true },
]

export interface SetupConfig {
  playerCount: number
  seats: Seat[]
  ismctsSims: number
  mccfrModel: string
}

export const ISMCTS_SIM_OPTIONS = [100, 500, 1000] as const
export const MCCFR_MODEL_OPTIONS = ['100K', '500K', 'Champion'] as const
export const GAMES_OPTIONS = [10, 50, 100, 500] as const

export interface RankEntry {
  rank: number
  name: string
  status: 'alive' | 'out'
}

export interface MatchResult {
  success: boolean
  winner: string
  winnerTitle: string
  rounds: number
  plays: number
  tribulations: number
  ranking: RankEntry[]
}

export const MOCK_RESULT: MatchResult = {
  success: true,
  winner: '青岚道友',
  winnerTitle: '最后存活 · 证道成功',
  rounds: 9,
  plays: 14,
  tribulations: 2,
  ranking: [
    { rank: 1, name: '青岚道友', status: 'alive' },
    { rank: 2, name: '清月仙子', status: 'out' },
    { rank: 3, name: '玄墨真人', status: 'out' },
    { rank: 4, name: '赤霄散人', status: 'out' },
    { rank: 5, name: '白露剑仙', status: 'out' },
  ],
}

export const MOCK_RESULT_FAIL: MatchResult = {
  success: false,
  winner: '清月仙子',
  winnerTitle: '最后存活 · 证道成功',
  rounds: 7,
  plays: 11,
  tribulations: 3,
  ranking: [
    { rank: 1, name: '清月仙子', status: 'alive' },
    { rank: 2, name: '玄墨真人', status: 'out' },
    { rank: 3, name: '我', status: 'out' },
    { rank: 4, name: '赤霄散人', status: 'out' },
  ],
}

export const HAND_CARD_IDS: CardId[] = [
  'hujiefu',
  'guanxingshu',
  'nitiangaiming',
  'dunshu',
  'shewushu',
]

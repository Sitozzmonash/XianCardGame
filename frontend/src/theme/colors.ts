/**
 * 颜色 token —— 冻结值来自 INTERFACES.md §5 / FRONTEND_GUIDE.md §3。
 * 页面与组件一律从这里取色，禁止散落字面量。
 */
export const colors = {
  background: '#06191B',
  surface: '#0B2929',
  jade: '#1C716B',
  jadeLight: '#57B3A4',
  gold: '#C9A65A',
  goldLight: '#E3CC91',
  paper: '#E8DEC5',
  danger: '#A4423D',
  text: '#F0E8D2',
  muted: '#91A6A0',

  /** 派生色（不改变上面冻结 token 的语义，仅用于层次感） */
  surfaceRaised: '#0F3433',
  surfaceSunken: '#041213',
  overlay: 'rgba(3, 13, 14, 0.82)',
  scrim: 'rgba(3, 13, 14, 0.55)',
  border: 'rgba(201, 166, 90, 0.32)',
  borderStrong: 'rgba(201, 166, 90, 0.66)',
  jadeBorder: 'rgba(87, 179, 164, 0.42)',
  dangerBorder: 'rgba(164, 66, 61, 0.72)',
  textFaint: 'rgba(240, 232, 210, 0.55)',
  disabled: 'rgba(145, 166, 160, 0.35)',
  transparent: 'transparent',
  black: '#000000',
  white: '#FFFFFF',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * 第二套色板：夜蓝青瓷 —— 用于「首页 / 对局 / 卡牌详情」三屏。
 * 数值来自设计图 2x 原图（images/figma/fig3_*.png）的像素采样，不是目测。
 * 「对战配置 / 结算」两屏继续用上面的墨玉色板（与 FRONTEND_GUIDE 冻结 token 一致）。
 */
export const nightColors = {
  /** 主背景 */
  background: '#0E1A22',
  /** 更深的底（底部栏 / 卡牌间隙） */
  backgroundDeep: '#070F14',
  /** 面板底 */
  surface: '#13232F',
  /** 抬升面板 */
  surfaceRaised: '#1A2C39',
  /** 对手面板 / 信息卡 */
  panel: '#263E4D',
  panelSoft: '#2D4857',
  /** 青瓷（标题、描边、重要文字） */
  celadon: '#78B2C4',
  celadonLight: '#B3D4D7',
  /** 玉绿（按钮、高亮、阶段提示） */
  jade: '#4EB294',
  jadeDeep: '#165E4E',
  jadeMid: '#348470',
  /** 卡面米黄 + 卡框金 */
  card: '#F5E6C8',
  cardShade: '#E1C89D',
  cardEdge: '#C9A65A',
  cardEdgeSoft: 'rgba(201, 166, 90, 0.55)',
  /** 金（按钮/角标） */
  gold: '#BEA144',
  goldSoft: '#8D7A46',
  /** 文字 */
  text: '#E8F1F2',
  textStrong: '#FFFFFF',
  muted: '#8FA3AD',
  /** 状态 */
  danger: '#A4423D',
  dangerSoft: 'rgba(164, 66, 61, 0.55)',
  disabled: 'rgba(143, 163, 173, 0.38)',
  /** 描边 / 分隔 */
  hairline: 'rgba(120, 178, 196, 0.22)',
  border: 'rgba(120, 178, 196, 0.34)',
  borderStrong: 'rgba(120, 178, 196, 0.62)',
  /** 覆盖层 */
  overlay: 'rgba(4, 10, 14, 0.84)',
  scrim: 'rgba(4, 10, 14, 0.52)',
  transparent: 'transparent',
  white: '#FFFFFF',
  black: '#000000',
} as const;

/** 夜蓝色板的渐变（LinearGradient 需要 readonly string[]） */
export const nightGradients = {
  /** 首页：夜色 → 青瓷天光 */
  home: ['#0E1A22', '#1B3345', '#78B2C4', '#B3D4D7'] as const,
  /** 对局：深墨蓝 */
  battle: ['#070F14', '#0E1A22', '#263E4D'] as const,
  /** 卡牌详情：近乎纯黑 → 暗蓝 */
  detail: ['#040506', '#0B0D0E', '#0E1A22'] as const,
  /** 卡面米黄 */
  cardFace: ['#F7EBD2', '#F5E6C8', '#E1C89D'] as const,
  /** 玉绿主按钮 */
  jadeButton: ['#4EB294', '#2E7A63'] as const,
  /** 青瓷辉光（法阵 / 高亮） */
  celadonGlow: ['rgba(120,178,196,0.55)', 'rgba(120,178,196,0)'] as const,
  /** 金边 */
  goldEdge: ['#E3CC91', '#C9A65A', '#8D7A46'] as const,
} as const;

/** LinearGradient 需要 readonly string[] */
export const gradients = {
  plain: ['#06191B', '#0A2426', '#0B2929'] as const,
  home: ['#06191B', '#0A2B2A', '#123C38'] as const,
  battle: ['#04120F', '#06191B', '#0B2929'] as const,
  modal: ['#0B2929', '#06191B'] as const,
  jade: ['#1C716B', '#0B2929'] as const,
  gold: ['#E3CC91', '#C9A65A', '#8A6D2F'] as const,
  danger: ['#A4423D', '#3A1512'] as const,
  cardArt: ['#123C38', '#0B2929', '#06191B'] as const,
  tribulationCard: ['#3A1512', '#A4423D', '#2A0E0C'] as const,
} as const;

/** 卡牌类型 → 主色（用于边框 / 光晕 / 标签） */
export const categoryColors: Record<
  'TRIBULATION' | 'DEFUSE' | 'ACTIVE' | 'REACTIVE',
  { border: string; glow: string; label: string }
> = {
  TRIBULATION: { border: colors.danger, glow: 'rgba(164,66,61,0.55)', label: '天劫' },
  DEFUSE: { border: colors.gold, glow: 'rgba(201,166,90,0.50)', label: '护劫' },
  ACTIVE: { border: colors.jadeLight, glow: 'rgba(87,179,164,0.45)', label: '主动' },
  REACTIVE: { border: colors.goldLight, glow: 'rgba(227,204,145,0.45)', label: '反制' },
};

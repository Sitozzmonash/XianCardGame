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

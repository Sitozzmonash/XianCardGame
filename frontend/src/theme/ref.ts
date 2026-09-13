/**
 * 参照色板 —— 逐值取自参考原型 `app/globals.css` 的 `@theme` 块与 shadcn :root 变量。
 * **不要改这里的值**（详见 `docs/FRONTEND_PORT_SPEC.md` §1）。
 */

export const ink = {
  950: '#040d0c',
  900: '#071614',
  850: '#0a1e1b',
  800: '#0c2420',
  700: '#103029',
  600: '#163d34',
} as const;

export const jade = {
  800: '#0f3d30',
  700: '#14503f',
  600: '#1b6b55',
  500: '#248a6e',
  400: '#35a184',
  300: '#5cbfa2',
} as const;

export const gold = {
  700: '#8a6f3c',
  600: '#a8874a',
  500: '#c9a86a',
  400: '#d8bd85',
  300: '#e8d5a8',
} as const;

export const cream = '#ece3cf';
export const creamDim = '#a9b8ae';
export const creamFaint = '#6f8479';

export const blood = {
  700: '#5e1f1f',
  600: '#7a2b2b',
  500: '#a13a3a',
} as const;

/** 参考里出现的两种「危险文字色」 */
export const dangerText = {
  blood: '#e8a9a9', // CounterModal 风格里的浅血色文字
  alert: '#e8b0a0', // GameModal tone="blood" 的标题色
} as const;

/**
 * Tailwind 的 `/NN` 透明度写法 → rgba。
 * 例：`rgba(gold[500], 0.4)` 等价 `border-gold-500/40`。
 */
export function rgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Tailwind 圆角刻度（px） */
export const radius = {
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
  full: 999,
} as const;

/** Tailwind 间距刻度：`space(3)` = 12px（间距单位 = 4px） */
export const sp = (units: number): number => units * 4;

/**
 * 字距：Tailwind `tracking-[0.18em]` = 0.18 × 字号。
 * RN 的 `letterSpacing` 单位就是 px，所以必须按字号换算。
 */
export const track = (em: number, fontSize: number): number => em * fontSize;

/** 参考里高频使用的渐变与阴影（RN 用数组喂给 expo-linear-gradient） */
export const refGradients = {
  /** `.panel` 的两层底（上层玉绿 28% → 下层近黑 72%）*/
  panel: ['rgba(20,80,63,0.28)', 'rgba(7,22,20,0.72)'] as const,
  /** 主按钮：`linear-gradient(180deg,#2f9d7e,#1b6b55 55%,#14503f)` */
  primaryButton: ['#2f9d7e', '#1b6b55', '#14503f'] as const,
  /** 结束回合按钮：金渐变 */
  goldButton: ['#d8bd85', '#c9a86a', '#a8874a'] as const,
  /** 选中胶囊（配置页）*/
  segmentActive: ['#2f9d7e', '#1b6b55'] as const,
  /** GameModal jade：`rgba(20,80,63,0.5) → rgba(7,22,20,0.97)` */
  modalJade: ['rgba(20,80,63,0.5)', 'rgba(7,22,20,0.97)'] as const,
  /** GameModal blood */
  modalBlood: ['rgba(94,31,31,0.55)', 'rgba(7,22,20,0.97)'] as const,
  /** 卡面底部压暗：`from-ink-950 via-ink-950/25 to-transparent` */
  cardScrim: ['rgba(4,13,12,0.98)', 'rgba(4,13,12,0.25)', 'rgba(4,13,12,0)'] as const,
  /** 内容区底部渐隐（GameBackdrop 最后一层）*/
  bottomVeil: ['rgba(4,13,12,0.4)', 'rgba(4,13,12,0)', 'rgba(4,13,12,0.8)'] as const,
} as const;

/** 背景径向渐变（`radi al-gradient(120% 80% at 50% -10%, #0f3d30, #071614 45%, #040d0c)`）*/
export const backdropStops = [
  { offset: '0%', color: '#0f3d30' },
  { offset: '45%', color: '#071614' },
  { offset: '100%', color: '#040d0c' },
] as const;

/** 卡背径向渐变 */
export const cardBackStops = [
  { offset: '0%', color: '#14503f' },
  { offset: '75%', color: '#071614' },
] as const;

/** 战场中央/首页法阵用的玉绿与金色 */
export const circleStroke = {
  jade: '#35a184',
  gold: '#c9a86a',
} as const;

export const circleSoft = {
  jade: 'rgba(53,161,132,0.35)',
  gold: 'rgba(201,168,106,0.35)',
} as const;

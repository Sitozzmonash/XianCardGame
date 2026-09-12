/**
 * 首页几何（设计基准：430×888 @1x）。
 *
 * 设计原图 `images/figma/fig3_0.png` 是 860×1864 = 430×932@2x，其中 y 0–44 是
 * iOS 状态栏。Web/Android 没有这层状态栏，所以本页把「设计 y 44」当作画布 y 0，
 * 画布高度 = 932 − 44 = 888。下面所有常量都已换算成画布坐标（design y − 44），
 * 数值来自 PIL 逐行/逐列的颜色掩码实测（见 docs/design_measurements.md + 本 agent 复测）。
 */
import { useWindowDimensions } from 'react-native';

export const DESIGN_WIDTH = 430;
export const DESIGN_HEIGHT = 888;
/** 设计图里被状态栏占掉的高度（本页不绘制） */
export const DESIGN_STATUS_INSET = 44;

/** 画布内所有几何：{x,y,w,h} 都是设计基准 1x 像素 */
export const HOME_GEOMETRY = {
  /** 顶部个人信息条 */
  infoBar: { x: 0, y: 0, w: 430, h: 62 },
  avatar: { cx: 51, cy: 37, d: 55 },
  name: { x: 86, y: 21, size: 15 },
  level: { x: 86, y: 40, size: 11 },
  resources: { right: 26, y: 24, size: 13 },
  demoTag: { right: 26, y: 46 },

  /** 四个圆形装饰徽记（设计图 y 75–101） */
  medallions: { cy: 88, d: 26, centers: [43, 160, 272, 387] as const },

  /** 夜色主视觉：上段（云雾 + 法阵，渐层重建） */
  sky: { x: 0, y: 0, w: 430, h: 143 },
  visualTop: { x: 0, y: 143, w: 430, h: 213 },
  /** 下段：直接使用设计图裁切 assets/design_crops/home_art.png（设计 y 400–641） */
  art: { x: 0, y: 356, w: 430, h: 241 },
  /**
   * 裁切位图以下的浅色云雾（设计 y641–932 被按钮/文字压住，不能整块裁切）
   * → 按设计原图逐行实测的平均色做渐层承接。
   */
  bottomMist: { x: 0, y: 597, w: 430, h: 291 },

  /** 法阵（同心圆 + 辉光），设计中心约 (215, 290) */
  rune: { cx: 215, cy: 246, r: 92 },

  /** 主标题 / 副标题 / 标签行 */
  title: { y: 162, size: 44, letterSpacing: 8 },
  subtitle: { y: 219, size: 13, letterSpacing: 6 },
  tags: { y: 234, h: 32 },
  slogan1: { x: 36, y: 301, size: 13, align: 'left' as const },
  slogan2: { x: 394, y: 335, size: 13, align: 'right' as const },

  /** 主按钮「开启对决（开始斩劫）」 */
  primary: { x: 26, y: 599, w: 378, h: 58 },
  /** 次入口两个 */
  secondary: { x: 26, y: 681, w: 182, h: 41, gap: 14 },
  /** 论道对战（排位赛，未开放） */
  ranked: { x: 26, y: 742, w: 378, h: 42 },
  /** 底部工具行（数据源 / AI 实验室 / 放弃对局）——设计图没有，用于保住旧首页的功能 */
  utility: { x: 26, y: 800, w: 378, h: 20 },
  /** 底部免责小字 */
  disclaimer: { x: 26, y: 838, w: 378, h: 46 },
} as const;

export interface Canvas {
  /** 画布宽度（画布坐标系下的 px，等于 DESIGN_WIDTH） */
  width: number;
  height: number;
  /** 设计像素 → 实际像素的缩放系数 */
  s: number;
  /** 画布左右外边距（居中留白） */
  offsetX: number;
  /** 安全区顶部内边距 */
  insetTop: number;
  /** 便捷函数：设计像素 → 实际像素 */
  dp: (value: number) => number;
}

/**
 * 画布缩放：430 宽设计稿等比缩放到容器宽度；桌面端最多放大到 480 宽，
 * 避免大屏上被拉伸变形（超过后画布居中）。
 *
 * `measuredWidth` 来自页面根的 `onLayout`（RN Web 用 ResizeObserver），
 * 比 `useWindowDimensions()` 在静态导出 + hydration 场景下可靠
 * （实测 hydration 后 Dimensions 可能停留在 0，导致整页被缩到 0.558×）。
 */
export function useCanvas(insetTop = 0, measuredWidth = 0): Canvas {
  const { width } = useWindowDimensions();
  const base = measuredWidth > 0 ? measuredWidth : width > 0 ? width : DESIGN_WIDTH;
  const usable = Math.max(240, base);
  const canvasPx = Math.min(usable, 480);
  const s = canvasPx / DESIGN_WIDTH;
  return {
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    s,
    offsetX: (usable - canvasPx) / 2,
    insetTop,
    dp: (value: number) => value * s,
  };
}

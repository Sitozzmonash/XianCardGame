import { useWindowDimensions } from 'react-native';

import { layout } from '@/theme/spacing';

export interface Responsive {
  width: number;
  height: number;
  isCompact: boolean;
  isWide: boolean;
  /** 去掉左右内边距后的可用宽度（已受 max-width 约束） */
  contentWidth: number;
  /** 全局缩放系数（用于字号 / 间距的轻微响应式调整） */
  scale: number;
  handCardWidth: number;
  handCardHeight: number;
  detailCardWidth: number;
  opponentColumns: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 响应式（FRONTEND_GUIDE §11）：只用 useWindowDimensions 推导尺寸，
 * 不按参考图的绝对像素硬编码。
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  const isCompact = width < 380;
  const isWide = width >= 768;
  const contentWidth = Math.min(width - 32, isWide ? layout.maxBattleWidth : layout.maxContentWidth);
  const scale = clamp(width / 390, 0.86, 1.18);

  const perRow = isCompact ? 3.2 : isWide ? 6.2 : 4.2;
  const handCardWidth = clamp((contentWidth - 16) / perRow, 58, 104);
  const handCardHeight = handCardWidth / layout.handCardAspect;

  return {
    width,
    height,
    isCompact,
    isWide,
    contentWidth,
    scale,
    handCardWidth,
    handCardHeight,
    detailCardWidth: clamp(contentWidth * 0.58, 150, 240),
    opponentColumns: width >= 560 ? 3 : 2,
  };
}

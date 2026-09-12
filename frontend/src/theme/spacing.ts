import { ViewStyle } from 'react-native';

import { colors } from './colors';

/** 4pt 基准间距阶梯 */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const borderWidth = {
  hair: 1,
  thin: 1.5,
  thick: 2,
} as const;

/** 触控最小尺寸（FRONTEND_GUIDE §13：≥44pt） */
export const minTouchTarget = 44;

export const shadows = {
  card: {
    shadowColor: colors.black,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  } satisfies ViewStyle,
  panel: {
    shadowColor: colors.black,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  } satisfies ViewStyle,
  gold: {
    shadowColor: colors.gold,
    shadowOpacity: 0.7,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  } satisfies ViewStyle,
} as const;

/** 内容最大宽度（Web / 平板居中，避免拉伸） */
export const layout = {
  maxContentWidth: 560,
  maxBattleWidth: 720,
  handCardAspect: 0.68,
} as const;

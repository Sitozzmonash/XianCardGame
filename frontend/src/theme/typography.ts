import { Platform, TextStyle } from 'react-native';

import { colors } from './colors';

/**
 * 字体：V1 不加载自定义字体文件（FRONTEND_GUIDE §12 要求先确认许可与包体），
 * 用系统 Serif 承担标题的「宋体 / 书法感」，正文用系统 Sans。
 */
export const fontFamily = {
  title:
    Platform.select({
      ios: 'Songti SC',
      android: 'serif',
      web: '"Noto Serif SC", "Songti SC", "STSong", serif',
      default: 'serif',
    }) ?? 'serif',
  body:
    Platform.select({
      ios: 'PingFang SC',
      android: 'sans-serif',
      web: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      default: 'sans-serif',
    }) ?? 'sans-serif',
};

export const fontWeight = {
  regular: '400',
  medium: '600',
  bold: '700',
} as const;

/** 字号阶梯（数值，按需乘响应式缩放系数） */
export const fontSize = {
  xxs: 10,
  xs: 11,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 26,
  display: 34,
} as const;

type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subtitle'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label'
  | 'button'
  | 'gold';

export const text: Record<TextVariant, TextStyle> = {
  display: {
    fontFamily: fontFamily.title,
    fontSize: fontSize.display,
    fontWeight: '700',
    color: colors.paper,
    letterSpacing: 6,
  },
  title: {
    fontFamily: fontFamily.title,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.paper,
    letterSpacing: 3,
  },
  heading: {
    fontFamily: fontFamily.title,
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.goldLight,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.md,
    color: colors.muted,
    letterSpacing: 2,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.sm,
    color: colors.muted,
  },
  label: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.xs,
    color: colors.muted,
    letterSpacing: 1,
  },
  button: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.paper,
    letterSpacing: 2,
  },
  gold: {
    fontFamily: fontFamily.title,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.gold,
    letterSpacing: 1,
  },
};

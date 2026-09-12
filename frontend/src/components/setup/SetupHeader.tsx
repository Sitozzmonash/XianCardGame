/**
 * 对战配置页：标题 + 分节标题（墨玉色板，鎏金细线）。
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

import { SETUP_GEOMETRY } from './design';

export function SetupHeader({ right }: { right?: React.ReactNode }) {
  const g = SETUP_GEOMETRY;
  return (
    <>
      <Text style={[styles.title, { left: g.title.x, top: g.title.y, fontSize: g.title.size }]}>
        天劫试炼
      </Text>
      <Text
        style={[
          styles.subtitle,
          { left: g.subtitle.x, top: g.subtitle.y, fontSize: g.subtitle.size, letterSpacing: g.subtitle.letterSpacing },
        ]}
      >
        对战配置
      </Text>
      <View style={[styles.rule, { left: g.headerRule.x, top: g.headerRule.y, width: g.headerRule.w }]} />
      {right ? <View style={styles.rightSlot}>{right}</View> : null}
    </>
  );
}

export function SectionHeader({
  x,
  y,
  size,
  label,
  right,
}: {
  x: number;
  y: number;
  size: number;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <>
      <View style={[styles.accent, { left: x, top: y + size / 2 - 1 }]} />
      <Text style={[styles.sectionLabel, { left: x + 10, top: y, fontSize: size }]}>{label}</Text>
      {right ? <View style={[styles.sectionRight, { top: y }]}>{right}</View> : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    position: 'absolute',
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: colors.goldLight,
    letterSpacing: 4,
  },
  subtitle: {
    position: 'absolute',
    fontFamily: fontFamily.body,
    color: colors.muted,
  },
  rule: {
    position: 'absolute',
    height: 1,
    backgroundColor: colors.border,
  },
  rightSlot: {
    position: 'absolute',
    right: 22,
    top: 24,
    alignItems: 'flex-end',
  },
  accent: {
    position: 'absolute',
    width: 2,
    height: 12,
    backgroundColor: colors.gold,
  },
  sectionLabel: {
    position: 'absolute',
    fontFamily: fontFamily.body,
    fontWeight: '600',
    color: colors.goldLight,
    letterSpacing: 3,
  },
  sectionRight: {
    position: 'absolute',
    right: 26,
  },
});

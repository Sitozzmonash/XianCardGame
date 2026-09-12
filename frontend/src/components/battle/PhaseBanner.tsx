/**
 * 阶段提示带（fig3_1 实测：y234-315 居中窄面板，玉绿标题 + 冷色说明）。
 * 文案与阶段名的映射与 BattleHeader 共用，避免两处各写一套。
 */
import { StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { Phase } from '@/types/game';

import { PHASE_HINTS, PHASE_LABELS } from './BattleHeader';

interface PhaseBannerProps {
  phase: Phase;
  /** 响应式缩放系数（设计基准 1） */
  s?: number;
  /** 面板宽度（设计约 100，太窄会换行） */
  width?: number;
}

export function PhaseBanner({ phase, s = 1, width }: PhaseBannerProps) {
  return (
    <View style={styles.row}>
      <View
        style={[
          styles.band,
          {
            minHeight: 78 * s,
            width: width ?? Math.min(150 * s, 200),
            paddingVertical: 8 * s,
          },
        ]}
      >
        <Text style={[styles.label, { fontSize: 14 * s }]} allowFontScaling={false}>
          {PHASE_LABELS[phase]}
        </Text>
        <View style={styles.divider} />
        <Text style={styles.hint} numberOfLines={3} allowFontScaling={false}>
          {PHASE_HINTS[phase]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: {
    borderWidth: borderWidth.hair,
    borderColor: 'rgba(78, 178, 148, 0.42)',
    borderRadius: radius.md,
    backgroundColor: 'rgba(20, 58, 58, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  label: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: nightColors.jade,
    letterSpacing: 2,
  },
  divider: {
    width: 26,
    height: 1,
    backgroundColor: 'rgba(201, 166, 90, 0.45)',
    marginVertical: 6,
  },
  hint: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.celadon,
    textAlign: 'center',
    letterSpacing: 0.5,
    lineHeight: 15,
  },
});

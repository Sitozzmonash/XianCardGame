import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

import type { ResultStat } from './result-stats';

interface ResultStatBlockProps {
  stats: ResultStat[];
}

/**
 * 统计三列（fig4_1 实测）：整块 x 28-401.5 / y 448-563.5，
 * 只有上下两条鎏金细线（无左右边框、无底色）；
 * 三列等宽、**左对齐**：标签 x 51/169/287，数字 y 502.5-524（字号 ≈30）。
 */
export function ResultStatBlock({ stats }: ResultStatBlockProps) {
  return (
    <View style={styles.block} testID="result-stats">
      {stats.map((stat) => (
        <View key={stat.key} style={styles.column} testID={`result-stat-${stat.key}`}>
          <Text style={styles.label}>{stat.label}</Text>
          <Text style={[styles.value, stat.available ? null : styles.valueUnavailable]}>
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flexDirection: 'row',
    width: '100%',
    minHeight: 115,
    paddingTop: 19,
    paddingBottom: 20,
    paddingLeft: 23,
    borderTopWidth: borderWidth.hair,
    borderBottomWidth: borderWidth.hair,
    borderColor: colors.border,
    marginTop: 31,
  },
  column: {
    flex: 1,
  },
  label: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.muted,
  },
  value: {
    fontFamily: fontFamily.title,
    fontSize: 30,
    fontWeight: '700',
    color: colors.goldLight,
    marginTop: 12,
  },
  valueUnavailable: {
    color: colors.muted,
  },
  source: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: colors.textFaint,
    marginTop: 2,
    letterSpacing: 1,
  },
});

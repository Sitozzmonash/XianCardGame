import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

/**
 * 鎏金分隔线（设计图 fig4_0 里成对出现的金色细线）+ 米黄菱形符点。
 * 纯矢量绘制（DESIGN_SPEC §6：图标优先用文字符号 / 矢量，不引图标库）。
 */
export function SectionRule({ style }: { style?: { marginTop?: number; marginBottom?: number } }) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.line} />
      <Text style={styles.mark}>◆</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: spacing.sm,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  mark: {
    color: colors.gold,
    fontSize: 9,
    marginHorizontal: spacing.sm,
  },
});

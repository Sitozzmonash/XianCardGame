import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, gradients } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

interface ResultActionsProps {
  onRestart: () => void;
  onHome: () => void;
  restarting?: boolean;
  restartDisabled?: boolean;
}

/**
 * 结算页按钮（fig4_1 实测）：y 824-877.5、高 53、圆角 14、鎏金描边；
 * 左「再来一局」玉绿主按钮（x 28-207.5）、右「返回主页」墨玉次按钮（x 222-401.5）。
 */
export function ResultActions({
  onRestart,
  onHome,
  restarting = false,
  restartDisabled = false,
}: ResultActionsProps) {
  const busy = restarting || restartDisabled;

  return (
    <View style={styles.row}>
      <Pressable
        testID="result-restart"
        accessibilityRole="button"
        accessibilityLabel="再来一局"
        accessibilityState={{ disabled: busy, busy: restarting }}
        disabled={busy}
        onPress={onRestart}
        style={styles.item}
      >
        <LinearGradient
          colors={busy ? [colors.surface, colors.surfaceSunken] : gradients.jade}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.fill, { borderColor: busy ? colors.disabled : colors.gold }]}
        >
          <Text style={[styles.primaryLabel, busy ? styles.labelDisabled : null]}>
            {restarting ? '正在建局…' : '再来一局'}
          </Text>
        </LinearGradient>
      </Pressable>

      <Pressable
        testID="result-home"
        accessibilityRole="button"
        accessibilityLabel="返回主页"
        onPress={onHome}
        style={styles.item}
      >
        <View style={[styles.fill, styles.secondary]}>
          <Text style={styles.secondaryLabel}>返回主页</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
    gap: 14,
    marginTop: 24,
  },
  item: {
    flex: 1,
    height: 53,
    borderRadius: 14,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hair,
    borderRadius: 14,
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.gold,
  },
  primaryLabel: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
    color: colors.text,
  },
  secondaryLabel: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
    color: colors.paper,
  },
  labelDisabled: {
    color: colors.muted,
  },
});

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

interface LoadingOverlayProps {
  visible: boolean;
  label?: string;
  /** overlay：盖住整屏（锁定输入）；inline：只在原位显示一行 */
  mode?: 'overlay' | 'inline';
}

/** 网络请求必须有 loading（FRONTEND_GUIDE §13） */
export function LoadingOverlay({ visible, label = '正在与天机通信…', mode = 'overlay' }: LoadingOverlayProps) {
  if (!visible) return null;

  if (mode === 'inline') {
    return (
      <View style={styles.inline} accessibilityRole="progressbar" accessibilityLabel={label}>
        <ActivityIndicator color={colors.goldLight} />
        <Text style={styles.inlineLabel}>{label}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.overlay}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      pointerEvents="auto"
    >
      <View style={styles.card}>
        <ActivityIndicator color={colors.goldLight} size="large" />
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
    zIndex: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  label: {
    ...text.caption,
    marginTop: spacing.sm,
    color: colors.goldLight,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  inlineLabel: {
    ...text.label,
    marginLeft: spacing.sm,
  },
});

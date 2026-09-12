import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

interface BannerProps {
  message?: string;
  tone?: 'error' | 'notice';
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

/** 错误 / 提示条：网络与冲突恢复都靠它给出可见反馈（不让用户面对静默失败） */
export function Banner({ message, tone = 'error', onDismiss, actionLabel, onAction }: BannerProps) {
  if (!message) return null;

  const borderColor = tone === 'error' ? colors.dangerBorder : colors.jadeBorder;
  const color = tone === 'error' ? colors.danger : colors.jadeLight;

  return (
    <View style={[styles.banner, { borderColor }]}>
      <Text style={[styles.mark, { color }]}>{tone === 'error' ? '⚠' : '☯'}</Text>
      <Text style={[styles.message, { color }]} accessibilityRole="alert">
        {message}
      </Text>
      <View style={styles.actions}>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            style={styles.action}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
        {onDismiss ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭提示"
            onPress={onDismiss}
            style={styles.action}
          >
            <Text style={styles.actionText}>关闭</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borderWidth.hair,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  mark: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  message: {
    ...text.caption,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    marginLeft: spacing.sm,
  },
  action: {
    minHeight: 32,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  actionText: {
    ...text.label,
    color: colors.goldLight,
    fontSize: 11,
  },
});

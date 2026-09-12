/**
 * 对局页提示条（错误 / 通知）—— 夜间变体。
 * 不替换共享的 `ui/Banner.tsx`（首页/配置/结算在用墨玉色板）。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

interface BattleNoticeProps {
  message?: string;
  tone?: 'error' | 'notice';
  onDismiss?: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export function BattleNotice({
  message,
  tone = 'error',
  onDismiss,
  actionLabel,
  onAction,
}: BattleNoticeProps) {
  if (!message) return null;

  const isError = tone === 'error';

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        {
          borderColor: isError ? nightColors.dangerSoft : 'rgba(78, 178, 148, 0.55)',
          backgroundColor: isError ? 'rgba(90, 33, 28, 0.55)' : 'rgba(14, 58, 48, 0.5)',
        },
      ]}
    >
      <Text style={styles.icon} allowFontScaling={false}>
        {isError ? '⚠' : '◈'}
      </Text>
      <Text style={styles.message} numberOfLines={3} allowFontScaling={false}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
        >
          <Text style={styles.actionText} allowFontScaling={false}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭提示"
          onPress={onDismiss}
          style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
        >
          <Text style={styles.closeText} allowFontScaling={false}>
            ×
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: borderWidth.hair,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginTop: 6,
  },
  icon: {
    fontSize: 12,
    color: nightColors.cardEdge,
  },
  message: {
    flex: 1,
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.text,
    lineHeight: 15,
  },
  action: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: borderWidth.hair,
    borderColor: nightColors.border,
  },
  actionText: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.celadonLight,
  },
  close: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: fontFamily.body,
    fontSize: 14,
    color: nightColors.muted,
  },
  pressed: {
    opacity: 0.7,
  },
});

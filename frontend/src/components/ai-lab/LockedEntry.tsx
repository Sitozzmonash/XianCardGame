import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

interface LockedEntryProps {
  title: string;
  description: string;
  /** 角标文案，默认「未开放」 */
  badge?: string;
  /** 真实原因（为什么现在不做） */
  reason?: string;
}

/**
 * 未开放功能条目：**明确 disabled + 角标**，不是假链接、不是灰按钮了事。
 * 用 View 而不是 Pressable —— 它压根不可点，因此不会误导用户。
 */
export function LockedEntry({ title, description, badge = '未开放', reason }: LockedEntryProps) {
  return (
    <View
      style={styles.row}
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`${title}（${badge}）${description}${reason ? ` ${reason}` : ''}`}
    >
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Badge label={badge} tone="muted" />
      </View>
      <Text style={styles.desc}>{description}</Text>
      {reason ? <Text style={styles.reason}>原因：{reason}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
    borderColor: colors.disabled,
    backgroundColor: 'rgba(4,18,19,0.55)',
    opacity: 0.75,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    ...text.caption,
    color: colors.muted,
    fontWeight: '600',
  },
  desc: {
    ...text.label,
    color: colors.textFaint,
    marginTop: spacing.xxs,
    lineHeight: 16,
  },
  reason: {
    ...text.label,
    color: colors.muted,
    marginTop: spacing.xxs,
    lineHeight: 16,
  },
});

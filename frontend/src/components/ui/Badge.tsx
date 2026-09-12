import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

export type BadgeTone = 'neutral' | 'jade' | 'gold' | 'danger' | 'muted';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

const TONE_COLOR: Record<BadgeTone, { border: string; color: string }> = {
  neutral: { border: colors.border, color: colors.text },
  jade: { border: colors.jadeBorder, color: colors.jadeLight },
  gold: { border: colors.borderStrong, color: colors.goldLight },
  danger: { border: colors.dangerBorder, color: colors.danger },
  muted: { border: colors.disabled, color: colors.muted },
};

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const palette = TONE_COLOR[tone];
  return (
    <View style={[styles.badge, { borderColor: palette.border }, style]}>
      <Text style={[styles.label, { color: palette.color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 1,
    borderRadius: radius.pill,
    borderWidth: borderWidth.hair,
    alignSelf: 'flex-start',
  },
  label: {
    ...text.label,
    fontSize: 10,
  },
});

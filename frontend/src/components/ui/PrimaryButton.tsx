import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, gradients } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

export type ButtonVariant = 'gold' | 'jade' | 'danger' | 'ghost';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** 左侧装饰字（符箓感） */
  glyph?: string;
  /** 按钮下方的小字说明（可访问性：不只靠颜色区分可用性） */
  hint?: string;
  accessibilityHint?: string;
  testID?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

const VARIANT_GRADIENT: Record<ButtonVariant, readonly [string, string, ...string[]]> = {
  gold: gradients.gold,
  jade: gradients.jade,
  danger: gradients.danger,
  ghost: [colors.surface, colors.surfaceSunken],
};

const VARIANT_BORDER: Record<ButtonVariant, string> = {
  gold: colors.goldLight,
  jade: colors.jadeBorder,
  danger: colors.dangerBorder,
  ghost: colors.border,
};

export function PrimaryButton({
  label,
  onPress,
  variant = 'gold',
  disabled = false,
  loading = false,
  glyph,
  hint,
  accessibilityHint,
  testID,
  compact = false,
  style,
}: PrimaryButtonProps) {
  const inactive = disabled || loading;
  const labelColor = disabled ? colors.muted : variant === 'ghost' ? colors.goldLight : colors.paper;

  return (
    <View style={style}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint ?? hint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        style={({ pressed }) => [
          styles.pressable,
          compact && styles.pressableCompact,
          pressed && !inactive ? styles.pressed : null,
        ]}
      >
        <LinearGradient
          colors={disabled ? [colors.surfaceRaised, colors.surfaceSunken] : VARIANT_GRADIENT[variant]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradient,
            { borderColor: disabled ? colors.disabled : VARIANT_BORDER[variant] },
          ]}
        >
          {glyph ? (
            <Text style={[styles.glyph, { color: disabled ? colors.muted : colors.goldLight }]}>
              {glyph}
            </Text>
          ) : null}
          <Text style={[styles.label, { color: labelColor }]} numberOfLines={2}>
            {loading ? '处理中…' : label}
          </Text>
        </LinearGradient>
      </Pressable>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: minTouchTarget + 4,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  pressableCompact: {
    minHeight: minTouchTarget,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  gradient: {
    flex: 1,
    minHeight: minTouchTarget + 4,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: borderWidth.thin,
    borderRadius: radius.md,
  },
  glyph: {
    ...text.gold,
    marginRight: spacing.sm,
    fontSize: 16,
  },
  label: {
    ...text.button,
    textAlign: 'center',
  },
  hint: {
    ...text.label,
    marginTop: spacing.xxs,
    textAlign: 'center',
  },
});

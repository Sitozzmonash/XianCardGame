/**
 * 夜蓝青瓷色板按钮（对局页 / 卡牌详情 / 四个特殊弹窗共用）。
 *
 * 为什么不直接改 `ui/PrimaryButton.tsx`：那是墨玉色板的共享组件，首页/配置/结算/卡册
 * 都在用。对局页需要「米黄卡面 + 鎏金 / 玉绿」的夜间变体，因此在 `ui/` 下**新增**
 * 一个变体文件，不改动既有组件的默认外观。
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

export type NightButtonVariant = 'gold' | 'jade' | 'ghost' | 'danger';

interface NightButtonProps {
  label: string;
  onPress: () => void;
  variant?: NightButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** 左侧符箓字 */
  glyph?: string;
  /** 按钮下方小字（可访问性：不只靠颜色表达可用性） */
  hint?: string;
  accessibilityHint?: string;
  testID?: string;
  /** 高度（默认 44，设计底部主按钮 42） */
  height?: number;
  /** 字号 */
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
}

const VARIANT_FILL: Record<NightButtonVariant, readonly [string, string, ...string[]]> = {
  gold: ['#E3CC91', '#C9A65A', '#A8862F'],
  jade: ['#5CC1A2', '#3E9C7F', '#1F6B58'],
  ghost: ['#1E3341', '#101F29'],
  danger: ['#B04A42', '#6E2A25'],
};

const VARIANT_BORDER: Record<NightButtonVariant, string> = {
  gold: '#8D7A46',
  jade: '#7FD8C0',
  ghost: 'rgba(120, 178, 196, 0.42)',
  danger: 'rgba(164, 66, 61, 0.85)',
};

const VARIANT_LABEL: Record<NightButtonVariant, string> = {
  gold: '#14100A',
  jade: '#04140F',
  ghost: nightColors.celadonLight,
  danger: nightColors.card,
};

export function NightButton({
  label,
  onPress,
  variant = 'jade',
  disabled = false,
  loading = false,
  glyph,
  hint,
  accessibilityHint,
  testID,
  height = 44,
  fontSize = 14,
  style,
}: NightButtonProps) {
  const inactive = disabled || loading;
  const fill: readonly [string, string, ...string[]] = inactive
    ? ['#1A2C39', '#0A141C']
    : VARIANT_FILL[variant];
  const labelColor = inactive ? nightColors.muted : VARIANT_LABEL[variant];

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
        style={({ pressed }) => [pressed && !inactive ? styles.pressed : null]}
      >
        <LinearGradient
          colors={fill}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[
            styles.button,
            {
              height,
              borderColor: inactive ? nightColors.disabled : VARIANT_BORDER[variant],
            },
          ]}
        >
          {glyph ? (
            <Text
              style={[
                styles.glyph,
                { color: inactive ? nightColors.muted : variant === 'gold' ? '#14100A' : nightColors.card },
              ]}
            >
              {glyph}
            </Text>
          ) : null}
          <Text
            style={[styles.label, { color: labelColor, fontSize }]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {loading ? '处理中…' : label}
          </Text>
        </LinearGradient>
      </Pressable>
      {hint ? (
        <Text style={styles.hint} allowFontScaling={false}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: borderWidth.hair,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  glyph: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    fontSize: 14,
    marginRight: 6,
  },
  label: {
    fontFamily: fontFamily.body,
    fontWeight: '600',
    letterSpacing: 1,
    textAlign: 'center',
  },
  hint: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.muted,
    marginTop: 2,
    textAlign: 'center',
  },
});

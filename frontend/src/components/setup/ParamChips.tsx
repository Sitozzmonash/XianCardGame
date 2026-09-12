/**
 * 参数胶囊行（ISMCTS simulations / MCCFR 模型）。
 *
 * 硬性要求：选中态不能只靠颜色 —— 选中胶囊加「✓」+ 加粗 + 鎏金描边；未选中是空心。
 * 数量少于设计稿时**不凑数**：有几项画几项，宽度按 max(项数, 3) 等分，1~3 个都对齐好看。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

export interface ChipOption {
  /** 胶囊里的短标签 */
  label: string;
  /** 提交值 */
  value: string;
  /** 无障碍标签（可选，比短标签更长） */
  a11yLabel?: string;
  /** 右上角小标记（如「?」= 人数未知） */
  mark?: string;
}

export function ParamChips({
  x,
  y,
  w,
  h,
  options,
  value,
  onChange,
  groupLabel,
  disabled,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  groupLabel: string;
  disabled?: boolean;
}) {
  const gap = 8;
  const slots = Math.max(options.length, 3);
  const chipW = (w - gap * (slots - 1)) / slots;

  return (
    <View style={[styles.row, { left: x, top: y, width: w, height: h }]} accessibilityRole="radiogroup" accessibilityLabel={groupLabel}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, disabled: Boolean(disabled) }}
            accessibilityLabel={option.a11yLabel ?? `${groupLabel}：${option.label}`}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.chip,
              {
                left: index * (chipW + gap),
                width: chipW,
                height: h,
                borderRadius: 6,
              },
              active ? styles.chipActive : null,
              disabled ? styles.chipDisabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>
              {active ? '✓ ' : ''}
              {option.label}
            </Text>
            {option.mark ? (
              <View style={styles.mark}>
                <Text style={styles.markText}>{option.mark}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
  },
  chip: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  chipActive: {
    borderWidth: 1.5,
    borderColor: colors.goldLight,
    backgroundColor: colors.jade,
  },
  chipDisabled: {
    opacity: 0.45,
  },
  chipText: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: colors.paper,
    fontWeight: '700',
  },
  mark: {
    position: 'absolute',
    right: 3,
    top: 1,
  },
  markText: {
    fontFamily: fontFamily.body,
    fontSize: 8,
    color: colors.gold,
  },
  pressed: {
    opacity: 0.82,
  },
});

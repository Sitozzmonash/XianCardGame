import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

/**
 * 单选胶囊组 —— 与对战配置页（`setup.tsx`）同一套视觉：
 * 胶囊形、金色细描边、选中态玉绿底 + 鎏金描边。
 *
 * 不可用的选项**不是**隐藏，而是 disabled + 「未开放」角标 + 明示原因
 * （DESIGN_SPEC §4 / FRONTEND_GUIDE §4.1：不做假链接、不假装能用）。
 */
export interface ChipOption {
  key: string;
  label: string;
  /** true = 该能力未开放：不可点击，显示角标 */
  locked?: boolean;
  /** 未开放的原因（真实约束，逐条显示在下方） */
  lockedReason?: string;
  accessibilityLabel?: string;
}

interface ChipSelectorProps {
  label: string;
  options: readonly ChipOption[];
  value: string | null;
  onChange: (key: string) => void;
  /** 选项下方的说明（例如后端真实默认值） */
  note?: string;
  testID?: string;
}

export function ChipSelector({
  label,
  options,
  value,
  onChange,
  note,
  testID,
}: ChipSelectorProps) {
  const lockedWithReason = options.filter((option) => option.locked && option.lockedReason);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const active = option.key === value;
          return (
            <Pressable
              key={option.key}
              testID={testID ? `${testID}-${option.key}` : undefined}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: option.locked === true }}
              accessibilityLabel={option.accessibilityLabel ?? option.label}
              disabled={option.locked === true}
              onPress={() => onChange(option.key)}
              style={[
                styles.chip,
                active ? styles.chipActive : null,
                option.locked ? styles.chipLocked : null,
              ]}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                {option.label}
              </Text>
              {option.locked ? <Text style={styles.lockBadge}>未开放</Text> : null}
            </Pressable>
          );
        })}
      </View>

      {note ? <Text style={styles.note}>{note}</Text> : null}

      {lockedWithReason.map((option) => (
        <Text key={option.key} style={styles.lockReason}>
          · {option.label}：{option.lockedReason}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: spacing.sm,
  },
  label: {
    ...text.label,
    color: colors.goldLight,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(11,41,41,0.7)',
  },
  chipActive: {
    borderColor: colors.goldLight,
    backgroundColor: 'rgba(28,113,107,0.5)',
  },
  chipLocked: {
    opacity: 0.45,
  },
  chipText: {
    ...text.caption,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.goldLight,
    fontWeight: '600',
  },
  lockBadge: {
    ...text.label,
    fontSize: 9,
    color: colors.muted,
    marginLeft: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderWidth: borderWidth.hair,
    borderColor: colors.disabled,
    borderRadius: radius.sm,
  },
  note: {
    ...text.label,
    color: colors.textFaint,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  lockReason: {
    ...text.label,
    color: colors.muted,
    marginTop: spacing.xxs,
    lineHeight: 16,
  },
});

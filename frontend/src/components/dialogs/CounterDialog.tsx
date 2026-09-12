import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { LegalAction } from '@/types/game';

import { DialogFrame } from './DialogFrame';

interface CounterDialogProps {
  visible: boolean;
  /** 威胁描述（由事件流推导的文案，例如「清月仙子 对你使用【摄物术】」） */
  threatText: string;
  /** 后端给出的 COUNTER 动作（可能为空 = 手中无反制符） */
  useAction?: LegalAction;
  /** 后端给出的 PASS_COUNTER 动作 */
  passAction?: LegalAction;
  handCount: number;
  submitting?: boolean;
  onUse: () => void;
  onPass: () => void;
  onClose: () => void;
}

/** 反制决策（API_CONTRACT §12.3）：两个动作都直接用后端下发的 label */
export function CounterDialog({
  visible,
  threatText,
  useAction,
  passAction,
  handCount,
  submitting = false,
  onUse,
  onPass,
  onClose,
}: CounterDialogProps) {
  return (
    <DialogFrame
      visible={visible}
      tone="gold"
      title="反制时机"
      subtitle="是否打出【反制符】？此决策由后端进入 COUNTER 阶段触发"
      onClose={onClose}
      footer={
        <>
          <View style={styles.footerItem}>
            <PrimaryButton
              label="稍后决定"
              variant="ghost"
              onPress={onClose}
              disabled={submitting}
              accessibilityHint="关闭弹窗，战斗页会保留待决策入口"
            />
          </View>
          {useAction ? (
            <View style={styles.footerItem}>
              <PrimaryButton
                label={useAction.label}
                variant="gold"
                onPress={onUse}
                loading={submitting}
                disabled={submitting}
                glyph="符"
                testID="counter-use"
              />
            </View>
          ) : null}
          {passAction ? (
            <View style={styles.footerItem}>
              <PrimaryButton
                label={passAction.label}
                variant="danger"
                onPress={onPass}
                loading={submitting}
                disabled={submitting}
                hint={useAction ? '选择承受可能失去一张手牌' : '手中没有反制符'}
                testID="counter-pass"
              />
            </View>
          ) : null}
        </>
      }
    >
      <View style={styles.card}>
        <Text style={styles.threat}>{threatText}</Text>
        <Text style={styles.meta}>你的手牌 {handCount} 张</Text>
        {!useAction ? (
          <Text style={styles.warn}>
            后端未给出 COUNTER 动作，说明当前手中没有反制符（前端不做此判断）。
          </Text>
        ) : null}
      </View>
    </DialogFrame>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: borderWidth.hair,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: 'rgba(164,66,61,0.14)',
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  threat: {
    ...text.bodyStrong,
    fontSize: 15,
  },
  meta: {
    ...text.label,
    marginTop: spacing.xs,
  },
  warn: {
    ...text.label,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  footerItem: {
    flex: 1,
    minWidth: 120,
  },
});

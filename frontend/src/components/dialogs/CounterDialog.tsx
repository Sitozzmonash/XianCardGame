/**
 * 反制决策弹窗（API_CONTRACT §12.3）—— 两个动作都直接用后端下发的 label。
 * 反制链深度固定 1，因此这里只有「打出反制符 / 不反制」两种可能，且都必须由
 * legal_actions 提供（没有 COUNTTER 动作就只显示「不反制」）。
 */
import { StyleSheet, Text, View } from 'react-native';

import { NightButton } from '@/components/ui/NightButton';
import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { LegalAction } from '@/types/game';

import { DialogFrame } from './DialogFrame';

interface CounterDialogProps {
  visible: boolean;
  /** 威胁描述（由事件流推导，例如「清月仙子 对你使用【摄物术】」） */
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
      tone="danger"
      title="反制时机"
      subtitle="是否打出【反制符】？此弹窗由后端进入 COUNTER 阶段触发"
      onClose={onClose}
      footer={
        <>
          <NightButton
            label="稍后决定"
            variant="ghost"
            onPress={onClose}
            disabled={submitting}
            style={styles.footerItem}
            accessibilityHint="关闭弹窗，战斗页会保留待决策入口"
          />
          {useAction ? (
            <NightButton
              label={useAction.label}
              variant="gold"
              onPress={onUse}
              loading={submitting}
              disabled={submitting}
              glyph="反"
              testID="counter-use"
              style={styles.footerItem}
            />
          ) : null}
          {passAction ? (
            <NightButton
              label={passAction.label}
              variant="danger"
              onPress={onPass}
              loading={submitting}
              disabled={submitting}
              hint={useAction ? '选择承受可能失去一张手牌' : '手中没有反制符'}
              testID="counter-pass"
              style={styles.footerItem}
            />
          ) : null}
        </>
      }
    >
      <View style={styles.card}>
        <Text style={styles.threat} numberOfLines={3} allowFontScaling={false}>
          {threatText}
        </Text>
        <Text style={styles.meta} allowFontScaling={false}>
          你的手牌 {handCount} 张
        </Text>
        {!useAction ? (
          <Text style={styles.warn} allowFontScaling={false}>
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
    borderColor: nightColors.dangerSoft,
    borderRadius: radius.md,
    backgroundColor: 'rgba(164, 66, 61, 0.18)',
    padding: 10,
  },
  threat: {
    fontFamily: fontFamily.title,
    fontSize: 14,
    fontWeight: '700',
    color: nightColors.card,
    letterSpacing: 0.5,
  },
  meta: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
    marginTop: 6,
  },
  warn: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.dangerText,
    marginTop: 6,
    lineHeight: 14,
  },
  footerItem: {
    flex: 1,
    minWidth: 104,
  },
});

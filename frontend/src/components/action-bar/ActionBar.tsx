import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import type { ButtonVariant } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { LegalAction } from '@/types/game';

interface ActionBarProps {
  /** 只传「不绑定手牌实例」的动作：END_ACTION / COUNTER / PASS_COUNTER / REORDER_TOP / REINSERT_TRIBULATION */
  actions: LegalAction[];
  onPress: (action: LegalAction) => void;
  disabled?: boolean;
  submitting?: boolean;
  emptyHint?: string;
}

function variantFor(action: LegalAction): ButtonVariant {
  switch (action.type) {
    case 'END_ACTION':
      return 'jade';
    case 'COUNTER':
      return 'gold';
    case 'PASS_COUNTER':
      return 'ghost';
    case 'REORDER_TOP':
      return 'gold';
    case 'REINSERT_TRIBULATION':
      return 'jade';
    default:
      return 'jade';
  }
}

/**
 * 动作条：**每一个按钮都直接来自后端 legal_actions**，没有动作就没有按钮。
 */
export function ActionBar({
  actions,
  onPress,
  disabled = false,
  submitting = false,
  emptyHint,
}: ActionBarProps) {
  return (
    <View style={styles.wrapper}>
      {actions.length === 0 ? (
        <Text style={styles.empty}>{emptyHint ?? '当前没有可执行的按钮动作'}</Text>
      ) : (
        <View style={styles.row}>
          {actions.map((action) => (
            <View key={action.id} style={styles.item}>
              <PrimaryButton
                testID={`action-${action.type}-${action.id}`}
                label={action.label}
                variant={variantFor(action)}
                disabled={disabled || action.enabled === false}
                loading={submitting}
                onPress={() => onPress(action)}
                accessibilityHint={`提交后端给出的动作 ${action.id}`}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    flexGrow: 1,
    flexBasis: 140,
  },
  empty: {
    ...text.caption,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});

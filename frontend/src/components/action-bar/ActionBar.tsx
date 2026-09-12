/**
 * 动作条：**每一个按钮都直接来自后端 legal_actions**，没有动作就没有按钮。
 *
 * 页面把「不绑定手牌实例」的动作交给这里（END_ACTION 作为底部主按钮单独处理，
 * 其余如 COUNTER / PASS_COUNTER / REORDER_TOP / REINSERT_TRIBULATION 作为胶囊行）。
 * 本组件不做任何规则判断，`enabled === false` 的动作一律禁用并显示原因。
 */
import { StyleSheet, Text, View } from 'react-native';

import { NightButton } from '@/components/ui/NightButton';
import type { NightButtonVariant } from '@/components/ui/NightButton';
import { nightColors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';
import type { LegalAction } from '@/types/game';

interface ActionBarProps {
  actions: LegalAction[];
  onPress: (action: LegalAction) => void;
  disabled?: boolean;
  submitting?: boolean;
  emptyHint?: string;
  /** 最近提交的动作 id（高亮，可访问性） */
  highlightId?: string;
  compact?: boolean;
}

function variantFor(action: LegalAction): NightButtonVariant {
  switch (action.type) {
    case 'END_ACTION':
      return 'gold';
    case 'COUNTER':
      return 'gold';
    case 'PASS_COUNTER':
      return 'ghost';
    case 'REORDER_TOP':
      return 'gold';
    case 'REINSERT_TRIBULATION':
      return 'danger';
    default:
      return 'jade';
  }
}

export function ActionBar({
  actions,
  onPress,
  disabled = false,
  submitting = false,
  emptyHint,
  highlightId,
  compact = false,
}: ActionBarProps) {
  return (
    <View style={styles.wrapper}>
      {actions.length === 0 ? (
        <Text style={styles.empty} numberOfLines={2} allowFontScaling={false}>
          {emptyHint ?? '当前没有可执行的按钮动作'}
        </Text>
      ) : (
        <View style={styles.row}>
          {actions.map((action) => (
            <NightButton
              key={action.id}
              testID={`action-${action.type}-${action.id}`}
              label={action.label}
              variant={variantFor(action)}
              height={compact ? 36 : 40}
              fontSize={compact ? 12 : 13}
              glyph="符"
              disabled={disabled || action.enabled === false}
              loading={submitting}
              hint={action.enabled === false ? '后端标记为不可用' : undefined}
              accessibilityHint={`提交后端给出的动作 ${action.id}`}
              onPress={() => onPress(action)}
              style={[
                styles.item,
                highlightId === action.id ? styles.itemHighlight : null,
              ]}
            />
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
    gap: 6,
  },
  item: {
    flexGrow: 1,
    flexBasis: 118,
    minWidth: 96,
  },
  itemHighlight: {
    borderColor: nightColors.cardEdge,
  },
  empty: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
    textAlign: 'center',
    paddingVertical: 4,
  },
});

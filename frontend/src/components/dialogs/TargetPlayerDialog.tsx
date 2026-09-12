import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { PlayerPublicView } from '@/types/game';

import { DialogFrame } from './DialogFrame';

interface TargetPlayerDialogProps {
  visible: boolean;
  /** 打出的是哪张牌（中文名） */
  cardName: string;
  /** 可选目标（**来自 legal_actions 的 params.target_player.options**） */
  options: PlayerPublicView[];
  submitting?: boolean;
  onConfirm: (playerId: number) => void;
  onClose: () => void;
}

/** 摄物术等「需要选择目标玩家」的决策（API_CONTRACT §12.2） */
export function TargetPlayerDialog({
  visible,
  cardName,
  options,
  submitting = false,
  onConfirm,
  onClose,
}: TargetPlayerDialogProps) {
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setSelected(options.length === 1 ? options[0].player_id : null);
    }
  }, [visible, options]);

  const selectedName = options.find((player) => player.player_id === selected)?.name;

  return (
    <DialogFrame
      visible={visible}
      tone="jade"
      title={`${cardName}：选择目标`}
      subtitle="目标范围由后端 legal_actions 给出，前端不做规则推断"
      onClose={onClose}
      footer={
        <>
          <View style={styles.footerItem}>
            <PrimaryButton label="取消" variant="ghost" onPress={onClose} disabled={submitting} />
          </View>
          <View style={styles.footerItem}>
            <PrimaryButton
              label={selectedName ? `确认 → ${selectedName}` : '请先选择目标'}
              variant="gold"
              disabled={selected === null || submitting}
              loading={submitting}
              onPress={() => {
                if (selected !== null) onConfirm(selected);
              }}
              testID="target-confirm"
            />
          </View>
        </>
      }
    >
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {options.length === 0 ? (
          <Text style={styles.empty}>没有可选目标（后端未提供该动作的 options）</Text>
        ) : (
          options.map((player) => {
            const isSelected = player.player_id === selected;
            return (
              <Pressable
                key={player.player_id}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: !player.alive }}
                accessibilityLabel={`${player.name}，手牌 ${player.hand_count} 张`}
                onPress={() => setSelected(player.player_id)}
                style={[styles.option, isSelected ? styles.optionSelected : null]}
              >
                <View style={styles.optionMain}>
                  <Text style={styles.optionName}>{player.name}</Text>
                  <Text style={styles.optionMeta}>
                    手牌 {player.hand_count} 张 · {player.alive ? '在世' : '已淘汰'} ·{' '}
                    {player.agent?.type ?? 'human'}
                  </Text>
                </View>
                <Text style={[styles.tick, isSelected ? styles.tickOn : null]}>
                  {isSelected ? '✓ 已选' : '未选'}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </DialogFrame>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 260,
  },
  listContent: {
    paddingBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: minTouchTarget,
    marginBottom: spacing.sm,
    backgroundColor: 'rgba(15,52,51,0.6)',
  },
  optionSelected: {
    borderColor: colors.goldLight,
    backgroundColor: 'rgba(28,113,107,0.42)',
  },
  optionMain: {
    flex: 1,
  },
  optionName: {
    ...text.bodyStrong,
  },
  optionMeta: {
    ...text.label,
    fontSize: 10,
  },
  tick: {
    ...text.label,
    fontSize: 10,
    color: colors.muted,
  },
  tickOn: {
    color: colors.goldLight,
  },
  empty: {
    ...text.caption,
    paddingVertical: spacing.md,
  },
  footerItem: {
    flex: 1,
  },
});

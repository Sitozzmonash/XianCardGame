/**
 * 摄物术等「需要选择目标玩家」的决策（API_CONTRACT §12.2）。
 * 可选目标**完全来自 legal_actions.params.target_player.options**，前端不做规则推断。
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NightButton } from '@/components/ui/NightButton';
import { battleAvatarFor } from '@/theme/asset-map';
import { nightColors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { PlayerPublicView } from '@/types/game';
import { Image } from 'react-native';

import { DialogFrame } from './DialogFrame';

interface TargetPlayerDialogProps {
  visible: boolean;
  cardName: string;
  options: PlayerPublicView[];
  submitting?: boolean;
  onConfirm: (playerId: number) => void;
  onClose: () => void;
}

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
          <NightButton
            label="取消"
            variant="ghost"
            onPress={onClose}
            disabled={submitting}
            style={styles.footerItem}
          />
          <NightButton
            label={selectedName ? `确认 → ${selectedName}` : '请先选择目标'}
            variant="gold"
            disabled={selected === null || submitting}
            loading={submitting}
            onPress={() => {
              if (selected !== null) onConfirm(selected);
            }}
            testID="target-confirm"
            style={styles.footerItem}
          />
        </>
      }
    >
      <View style={styles.list}>
        {options.length === 0 ? (
          <Text style={styles.empty} allowFontScaling={false}>
            没有可选目标（后端未提供该动作的 options）
          </Text>
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
                <View style={styles.avatar}>
                  <Image
                    source={battleAvatarFor(player.player_id)}
                    style={[StyleSheet.absoluteFill, styles.avatarImage]}
                    resizeMode="cover"
                  />
                </View>
                <View style={styles.optionMain}>
                  <Text style={styles.optionName} numberOfLines={1} allowFontScaling={false}>
                    {player.name}
                  </Text>
                  <Text style={styles.optionMeta} numberOfLines={1} allowFontScaling={false}>
                    手牌 {player.hand_count} 张 · {player.alive ? '在世' : '已淘汰'} ·{' '}
                    {player.agent?.type ?? 'human'}
                  </Text>
                </View>
                <Text style={[styles.tick, isSelected ? styles.tickOn : null]} allowFontScaling={false}>
                  {isSelected ? '✓ 已选' : '未选'}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </DialogFrame>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: borderWidth.hair,
    borderColor: nightColors.hairline,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: minTouchTarget,
    marginBottom: 6,
    backgroundColor: 'rgba(19, 35, 47, 0.85)',
  },
  optionSelected: {
    borderColor: nightColors.cardEdgeSoft,
    backgroundColor: 'rgba(52, 132, 112, 0.35)',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: borderWidth.hair,
    borderColor: nightColors.hairline,
    backgroundColor: nightColors.backgroundDeep,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  optionMain: {
    flex: 1,
  },
  optionName: {
    fontFamily: fontFamily.title,
    fontSize: 13,
    fontWeight: '700',
    color: nightColors.text,
  },
  optionMeta: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
    marginTop: 1,
  },
  tick: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
  },
  tickOn: {
    color: nightColors.cardEdge,
  },
  empty: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    color: nightColors.muted,
    paddingVertical: 10,
  },
  footerItem: {
    flex: 1,
  },
});

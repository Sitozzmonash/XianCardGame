import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { GameCard } from '@/components/game-card/GameCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { colors } from '@/theme/colors';
import { borderWidth, minTouchTarget, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import type { PrivateCardToken } from '@/types/card';
import { cardNameOf } from '@/utils/card-catalog';
import type { LegalAction } from '@/types/game';

import { DialogFrame } from './DialogFrame';

const ROW_HEIGHT = 62;

interface ReorderTopDialogProps {
  visible: boolean;
  /** observation.private_context.cards（token 不暴露真实牌堆下标） */
  tokens: PrivateCardToken[];
  action?: LegalAction;
  submitting?: boolean;
  /** 提交 token 顺序（API_CONTRACT §12.4 的 payload.order） */
  onSubmit: (order: string[]) => void;
  onClose: () => void;
}

interface DraggableRowProps {
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  children: React.ReactNode;
}

function DraggableRow({ index, total, onMove, children }: DraggableRowProps) {
  const translateY = useSharedValue(0);
  const active = useSharedValue(0);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(120)
        .onStart(() => {
          active.value = 1;
        })
        .onUpdate((event) => {
          translateY.value = event.translationY;
        })
        .onEnd((event) => {
          const offset = Math.round(event.translationY / ROW_HEIGHT);
          const target = Math.max(0, Math.min(total - 1, index + offset));
          translateY.value = withTiming(0, { duration: 150 });
          if (target !== index) {
            runOnJS(onMove)(index, target);
          }
        })
        .onFinalize(() => {
          active.value = 0;
        }),
    [active, index, onMove, total, translateY],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: active.value ? 1.02 : 1 }],
    zIndex: active.value ? 20 : 1,
    shadowOpacity: active.value ? 0.6 : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.row, animatedStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}

/**
 * 逆天改命排序（API_CONTRACT §12.4）。
 * 拖拽排序（gesture-handler + reanimated）为主，另提供上移/下移按钮（可访问性 & Web 兜底）。
 */
export function ReorderTopDialog({
  visible,
  tokens,
  action,
  submitting = false,
  onSubmit,
  onClose,
}: ReorderTopDialogProps) {
  const tokenKey = tokens.map((token) => token.token).join(',');
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setOrder(tokens.map((token) => token.token));
    }
    // tokenKey 表示后端下发的 token 集合（同一 revision 内稳定）
  }, [visible, tokenKey, tokens]);

  const tokenMap = useMemo(() => {
    const map = new Map<string, PrivateCardToken>();
    tokens.forEach((token) => map.set(token.token, token));
    return map;
  }, [tokens]);

  const move = useCallback((from: number, to: number) => {
    setOrder((current) => {
      if (from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const shift = (index: number, direction: -1 | 1) => move(index, index + direction);

  const topIsTribulation = order.length > 0 && tokenMap.get(order[0])?.card_id === 'TRIBULATION';
  const canSubmit = order.length > 0 && order.length === tokens.length;

  return (
    <DialogFrame
      visible={visible}
      tone="gold"
      title="逆天改命：排列牌堆顶"
      subtitle="长按拖动排序，或用 ↑ / ↓ 按钮调整；提交的是 token 顺序，不含真实牌堆下标"
      onClose={onClose}
      footer={
        <>
          <View style={styles.footerItem}>
            <PrimaryButton
              label="重置"
              variant="ghost"
              disabled={submitting}
              onPress={() => setOrder(tokens.map((token) => token.token))}
            />
          </View>
          <View style={styles.footerItem}>
            <PrimaryButton
              label={action ? action.label : '按当前顺序放回牌堆顶'}
              variant="gold"
              disabled={!canSubmit || submitting}
              loading={submitting}
              onPress={() => onSubmit(order)}
              testID="reorder-submit"
            />
          </View>
        </>
      }
    >
      <View style={styles.listWrap}>
        {order.map((token, index) => {
          const card = tokenMap.get(token);
          const cardId = card?.card_id ?? 'ESCAPE';
          return (
            <DraggableRow key={token} index={index} total={order.length} onMove={move}>
              <Text style={styles.position}>{index + 1}</Text>
              <GameCard cardId={cardId} name={card?.name ?? cardNameOf(cardId)} width={40} height={54} />
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{card?.name ?? cardNameOf(cardId)}</Text>
                <Text style={styles.rowToken}>{token}</Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`第 ${index + 1} 位上移`}
                  disabled={index === 0}
                  onPress={() => shift(index, -1)}
                  style={[styles.arrow, index === 0 ? styles.arrowDisabled : null]}
                >
                  <Text style={styles.arrowText}>↑</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`第 ${index + 1} 位下移`}
                  disabled={index === order.length - 1}
                  onPress={() => shift(index, 1)}
                  style={[
                    styles.arrow,
                    index === order.length - 1 ? styles.arrowDisabled : null,
                  ]}
                >
                  <Text style={styles.arrowText}>↓</Text>
                </Pressable>
              </View>
            </DraggableRow>
          );
        })}
      </View>

      <Text style={styles.preview}>
        提交顺序：{order.map((token) => tokenMap.get(token)?.name ?? token).join(' → ')}
      </Text>
      {topIsTribulation ? (
        <Text style={styles.warn}>⚠ 天劫被放在牌堆顶，下一位抽牌者立刻遭劫。</Text>
      ) : null}
    </DialogFrame>
  );
}

const styles = StyleSheet.create({
  listWrap: {
    marginBottom: spacing.sm,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15,52,51,0.75)',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    shadowColor: colors.gold,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  position: {
    ...text.gold,
    width: 22,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  rowName: {
    ...text.bodyStrong,
    fontSize: 13,
  },
  rowToken: {
    ...text.label,
    fontSize: 10,
    color: colors.jadeLight,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  arrow: {
    width: minTouchTarget,
    height: minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  arrowDisabled: {
    opacity: 0.35,
  },
  arrowText: {
    color: colors.goldLight,
    fontSize: 16,
  },
  preview: {
    ...text.label,
    color: colors.textFaint,
  },
  warn: {
    ...text.label,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  footerItem: {
    flex: 1,
  },
});

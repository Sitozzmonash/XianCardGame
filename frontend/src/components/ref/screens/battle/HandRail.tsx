/**
 * 手牌横滑 —— 参考 `BattleScreen.tsx` 第 84–95 行原样移植。
 *
 *   第 85 行 `mt-3 flex gap-2.5 overflow-x-auto scrollbar-none px-4 pb-1`
 *   第 87-92 行 `GameCard size="sm" index={index + 1}`（70×93.3，左上角序号）
 *
 * 铁律 1：`disabled` **完全**由「这张牌有没有来自后端的动作」决定 ——
 *   - 有动作：可点 → 打开「使用卡牌」确认层 → 进入该牌各自的交互；
 *   - 没有动作（如规则里自动生效的护劫符、只能反制的反制符）：`disabled` + `dimmed`，点不动；
 *   - 提交中 / 动画播放中：一律 `disabled`（铁律 2），但不变灰（那会让玩家误以为牌废了）。
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { GameCard } from '@/components/ref/GameCard';
import { creamFaint, sp } from '@/theme/ref';
import { sans } from '@/theme/refFonts';

export interface HandItem {
  instance_id: string;
  card_id: string;
  name: string;
  /** 后端是否给出该牌（或同类型实例）的合法动作 */
  playable: boolean;
  /** 该牌的动作是否需要再选目标（摄物术） */
  needsTarget?: boolean;
}

export function HandRail({
  items,
  selectedInstanceId,
  locked,
  onPress,
}: {
  items: HandItem[];
  selectedInstanceId?: string;
  locked: boolean;
  onPress: (instanceId: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.rail}
      contentContainerStyle={styles.railInner}
    >
      {items.length === 0 ? (
        <Text style={styles.empty} allowFontScaling={false}>
          手牌已空。
        </Text>
      ) : (
        items.map((item, index) => (
          <View key={item.instance_id} style={styles.slot}>
            <GameCard
              testID={`hand-${item.instance_id}`}
              cardId={item.card_id}
              name={item.name}
              size="sm"
              index={index + 1}
              selected={selectedInstanceId === item.instance_id}
              dimmed={!item.playable}
              disabled={locked || !item.playable}
              onPress={() => onPress(item.instance_id)}
            />
            {!item.playable ? (
              <Text style={styles.badge} allowFontScaling={false}>
                无可用动作
              </Text>
            ) : item.needsTarget ? (
              <Text style={styles.badgeActive} allowFontScaling={false}>
                需选目标
              </Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { marginTop: sp(3), flexGrow: 0 },
  railInner: { gap: sp(2.5), paddingHorizontal: sp(4), paddingBottom: sp(1), alignItems: 'flex-start' },
  slot: { alignItems: 'center' },
  badge: { ...sans(400), fontSize: 9, color: creamFaint, marginTop: 3 },
  badgeActive: { ...sans(500), fontSize: 9, color: creamFaint, marginTop: 3 },
  empty: { ...sans(400), fontSize: 10, color: creamFaint, paddingVertical: sp(2) },
});

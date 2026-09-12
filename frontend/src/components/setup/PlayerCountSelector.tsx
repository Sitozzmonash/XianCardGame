/**
 * 玩家人数：2–6 单选（设计图是一整条分段控件，选中段填 `colors.jade`）。
 *
 * 可访问性要求（任务硬性）：选中态不能只靠颜色 —— 选中段额外显示「✓」并把
 * 文本加粗，未选中段是描边空心。
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

export const PLAYER_COUNTS = [2, 3, 4, 5, 6] as const;

export function PlayerCountSelector({
  x,
  y,
  w,
  h,
  value,
  onChange,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  onChange: (players: number) => void;
}) {
  const segW = w / PLAYER_COUNTS.length;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="玩家人数"
      style={[styles.track, { left: x, top: y, width: w, height: h }]}
    >
      {PLAYER_COUNTS.map((count, index) => {
        const active = count === value;
        return (
          <Pressable
            key={count}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${count} 人`}
            onPress={() => onChange(count)}
            style={({ pressed }) => [
              styles.segment,
              {
                left: index * segW,
                width: segW,
                height: h,
                borderRadius: 999,
              },
              active ? styles.segmentActive : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
              {active ? '✓ ' : ''}
              {count} 人
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    flexDirection: 'row',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  segment: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.jade,
    borderWidth: 1.5,
    borderColor: colors.goldLight,
  },
  segmentText: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  segmentTextActive: {
    color: colors.paper,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.82,
  },
});

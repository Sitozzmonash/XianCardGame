/**
 * 事件条：把 `animationQueue` 逐条播完，**它排空队列，输入才解锁**（铁律 2）。
 *
 * 为什么必须有这一层：store 在提交后把 `events` 按 seq 压进 `animationQueue` 并锁住输入
 * （`selectInputLocked`），只有队列清空才解锁。参考原型没有事件流（无后端），
 * 因此这里做一个 ref 配色的小条：每条的展示时长用 `presentEvent()` 给的 `durationMs`，
 * 播完调 `dequeueEvent()`；点一下即 `skipAnimations()` 全部跳过（玩家不必等）。
 *
 * 位置固定在轮次胶囊下方，不撑动主体版面（参考的对手横滑卡就在这一带，条子浮在它上面）。
 */

import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useGameStore } from '@/store/game-store';
import { cream, creamDim, gold, ink, jade, radius, rgba, sp } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';
import type { EventTone } from '@/utils/event-log';
import { presentEvent } from '@/utils/event-log';
import { playerNameOf } from '@/utils/legal-actions';

const TONE_TEXT: Record<EventTone, string> = {
  jade: jade[300],
  gold: gold[300],
  danger: '#e8a9a9',
  neutral: cream,
  muted: creamDim,
};

export function EventTicker() {
  const queue = useGameStore((state) => state.animationQueue);
  const view = useGameStore((state) => state.view);
  const dequeueEvent = useGameStore((state) => state.dequeueEvent);
  const skipAnimations = useGameStore((state) => state.skipAnimations);

  const current = queue[0];
  const presented = useMemo(
    () => (current ? presentEvent(current, (playerId) => playerNameOf(view, playerId)) : null),
    [current, view],
  );

  const duration = presented?.durationMs ?? 700;
  const seq = current?.seq;

  useEffect(() => {
    if (seq === undefined) return;
    const timer = setTimeout(() => dequeueEvent(), duration);
    return () => clearTimeout(timer);
  }, [seq, duration, dequeueEvent]);

  if (!current || !presented) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`事件：${presented.title}，点按跳过动画`}
      onPress={skipAnimations}
      style={[styles.wrap, { borderColor: rgba(gold[500], 0.3) }]}
      testID="event-ticker"
    >
      <Text
        style={[styles.title, { color: TONE_TEXT[presented.tone] }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {presented.title}
      </Text>
      {presented.detail && presented.detail !== '…' ? (
        <Text style={styles.detail} numberOfLines={1} allowFontScaling={false}>
          {presented.detail}
        </Text>
      ) : null}
      <View style={styles.trailing}>
        <Text style={styles.meta} allowFontScaling={false}>
          剩余 {queue.length}
        </Text>
        <Text style={styles.meta} allowFontScaling={false}>
          点按跳过
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: sp(4),
    right: sp(4),
    top: 56,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    borderRadius: radius.xl,
    borderWidth: 1,
    backgroundColor: rgba(ink[950], 0.9),
    paddingHorizontal: sp(3),
    paddingVertical: 6,
  },
  title: { ...serif(600), fontSize: 12, letterSpacing: 0.6, flexShrink: 0 },
  detail: { ...sans(400), fontSize: 10, color: creamDim, flexShrink: 1 },
  trailing: { marginLeft: 'auto', alignItems: 'flex-end' },
  meta: { ...sans(400), fontSize: 9, color: creamDim },
});

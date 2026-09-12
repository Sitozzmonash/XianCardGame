import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useGameStore } from '@/store/game-store';
import { colors, gradients } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { fontFamily, text } from '@/theme/typography';
import type { EventTone } from '@/utils/event-log';
import { presentEvent } from '@/utils/event-log';
import { playerNameOf } from '@/utils/legal-actions';
import { LinearGradient } from 'expo-linear-gradient';

const TONE_COLORS: Record<EventTone, string> = {
  jade: colors.jadeLight,
  gold: colors.goldLight,
  danger: colors.danger,
  neutral: colors.text,
  muted: colors.muted,
};

const TONE_FLASH: Record<EventTone, string> = {
  jade: 'rgba(87,179,164,0.22)',
  gold: 'rgba(201,166,90,0.26)',
  danger: 'rgba(164,66,61,0.34)',
  neutral: 'rgba(240,232,210,0.14)',
  muted: 'rgba(145,166,160,0.16)',
};

/**
 * 事件动画队列播放器（FRONTEND_GUIDE §6/§7）。
 *
 * 每次提交动作后，store 把 events[] 按 seq 放进 animationQueue 并锁住输入；
 * 这里逐条播放（横幅 + 光效），播完一条调用 dequeue()，
 * 队列清空后 store 自动解锁输入 —— **动画绝不延迟后端状态**（state 早已是新状态）。
 */
export function EventAnimator() {
  const queue = useGameStore((state) => state.animationQueue);
  const view = useGameStore((state) => state.view);
  const dequeue = useGameStore((state) => state.dequeueEvent);
  const skipAnimations = useGameStore((state) => state.skipAnimations);

  const current = queue[0];
  const nameOf = useCallback(
    (playerId: number | null | undefined) => playerNameOf(view, playerId),
    [view],
  );
  const presented = useMemo(
    () => (current ? presentEvent(current, nameOf) : null),
    [current, nameOf],
  );

  const durationRef = useRef(700);
  const dequeueRef = useRef(dequeue);
  const presentedRef = useRef(presented);
  durationRef.current = presented?.durationMs ?? 700;
  dequeueRef.current = dequeue;
  presentedRef.current = presented;

  const bannerOpacity = useSharedValue(0);
  const bannerScale = useSharedValue(0.9);
  const flashOpacity = useSharedValue(0);
  const [tone, setTone] = useState<EventTone>('jade');
  const [impact, setImpact] = useState(false);

  const seq = current?.seq;
  const type = current?.type;

  useEffect(() => {
    if (seq === undefined || !presentedRef.current) return;
    const info = presentedRef.current;

    setTone(info.tone);
    setImpact(info.impact);

    bannerOpacity.value = 0;
    bannerScale.value = 0.9;
    bannerOpacity.value = withTiming(1, { duration: 150 });
    bannerScale.value = withSequence(
      withTiming(1.06, { duration: 220 }),
      withTiming(1, { duration: 240 }),
    );

    if (info.impact) {
      flashOpacity.value = 0;
      flashOpacity.value = withSequence(
        withTiming(1, { duration: 160 }),
        withTiming(0, { duration: Math.max(200, info.durationMs - 220) }),
      );
    } else {
      flashOpacity.value = withTiming(0, { duration: 120 });
    }

    const timer = setTimeout(() => {
      dequeueRef.current();
    }, info.durationMs);

    return () => clearTimeout(timer);
  }, [seq, type, bannerOpacity, bannerScale, flashOpacity]);

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: bannerOpacity.value,
    transform: [{ scale: bannerScale.value }],
  }));

  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  if (!current || !presented) return null;

  const toneColor = TONE_COLORS[tone];

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: TONE_FLASH[tone] }, flashStyle]} />

      {type === 'TRIBULATION_DRAWN' || type === 'PLAYER_ELIMINATED' ? (
        <View pointerEvents="none" style={styles.lightningWrap}>
          <View style={[styles.lightning, { transform: [{ rotate: '12deg' }] }]} />
          <View style={[styles.lightning, { transform: [{ rotate: '-16deg' }], opacity: 0.6 }]} />
        </View>
      ) : null}

      {type === 'TRIBULATION_DEFUSED' ? (
        <View pointerEvents="none" style={styles.talismanWrap}>
          <View style={styles.talisman}>
            <Text style={styles.talismanGlyph}>符</Text>
          </View>
        </View>
      ) : null}

      <View pointerEvents="box-none" style={styles.centerWrap}>
        <Animated.View style={[styles.banner, { borderColor: toneColor }, bannerStyle]}>
          <LinearGradient
            colors={gradients.modal}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerInner}
          >
            <Text style={[styles.title, { color: toneColor }]}>{presented.title}</Text>
            <Text style={styles.detail}>{presented.detail}</Text>
            <Text style={styles.counter}>
              事件 {current.seq} · 队列剩余 {queue.length - 1}
            </Text>
          </LinearGradient>
        </Animated.View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="跳过剩余动画"
          onPress={skipAnimations}
          style={styles.skip}
        >
          <Text style={styles.skipText}>跳过动画</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  banner: {
    minWidth: 220,
    maxWidth: 420,
    borderWidth: borderWidth.thin,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  bannerInner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  title: {
    ...text.heading,
    fontSize: 20,
    textAlign: 'center',
  },
  detail: {
    ...text.caption,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  counter: {
    ...text.label,
    fontSize: 10,
    marginTop: spacing.xs,
  },
  skip: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    backgroundColor: 'rgba(4,18,19,0.8)',
  },
  skipText: {
    ...text.label,
    color: colors.goldLight,
  },
  lightningWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  lightning: {
    width: 3,
    height: '70%',
    backgroundColor: 'rgba(240,232,210,0.5)',
    marginTop: -40,
  },
  talismanWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talisman: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: borderWidth.thick,
    borderColor: colors.goldLight,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,166,90,0.18)',
  },
  talismanGlyph: {
    fontFamily: fontFamily.title,
    fontSize: 56,
    color: colors.goldLight,
  },
});

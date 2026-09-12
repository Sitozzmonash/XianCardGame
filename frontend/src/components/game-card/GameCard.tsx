import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, categoryColors, gradients } from '@/theme/colors';
import { borderWidth, radius, shadows, spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { CardCategory } from '@/types/card';
import { CARD_GLYPHS, CATEGORY_LABELS, cardSpecOf } from '@/utils/card-catalog';
import type { CardVisualState } from '@/utils/legal-actions';

export type CardSize = 'hand' | 'preview' | 'detail';

interface GameCardProps {
  cardId: string;
  name?: string;
  category?: CardCategory | string | null;
  state?: CardVisualState;
  size?: CardSize;
  width?: number;
  height?: number;
  onPress?: () => void;
  /** 置灰但仍可点开详情（手牌区需要：不可用 ≠ 不能查看说明） */
  pressableWhenDisabled?: boolean;
  footnote?: string;
  /** 右下角小标记，例如张数 */
  cornerLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const STATE_LABEL: Record<CardVisualState, string> = {
  idle: '',
  playable: '可出',
  selected: '已选',
  disabled: '不可用',
};

/**
 * FRONTEND_GUIDE §10 的卡牌组件。
 * state 由调用方从 legal_actions 推导（见 utils/legal-actions.ts），本组件不做任何规则判断。
 */
export function GameCard({
  cardId,
  name,
  category,
  state = 'idle',
  size = 'hand',
  width,
  height,
  onPress,
  pressableWhenDisabled = false,
  footnote,
  cornerLabel,
  testID,
  style,
}: GameCardProps) {
  const spec = cardSpecOf(cardId);
  const resolvedName = name ?? spec?.name ?? cardId;
  const resolvedCategory = (category ?? spec?.category ?? 'ACTIVE') as CardCategory;
  const palette = categoryColors[resolvedCategory] ?? categoryColors.ACTIVE;

  const resolvedWidth =
    width ?? (size === 'detail' ? 168 : size === 'preview' ? 84 : 88);
  const resolvedHeight = height ?? Math.round(resolvedWidth / 0.68);

  const glyphSize = Math.round(resolvedWidth * 0.44);
  const nameSize = Math.max(9, Math.min(Math.round(resolvedWidth * 0.15), 14));

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const interactive =
    typeof onPress === 'function' && (state !== 'disabled' || pressableWhenDisabled);
  const artGradient =
    resolvedCategory === 'TRIBULATION' ? gradients.tribulationCard : gradients.cardArt;

  const accent = state === 'disabled' ? colors.disabled : palette.border;
  const stateLabel = STATE_LABEL[state];

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        testID={testID}
        accessibilityRole={interactive ? 'button' : 'image'}
        accessibilityLabel={`${resolvedName}（${CATEGORY_LABELS[resolvedCategory] ?? ''}）${
          state === 'disabled'
            ? pressableWhenDisabled
              ? '，当前不可用，可查看详情'
              : '，当前不可用'
            : state === 'playable'
              ? '，可以使用'
              : ''
        }`}
        accessibilityState={{ disabled: !interactive, selected: state === 'selected' }}
        disabled={!interactive}
        onPress={onPress}
        onPressIn={() => {
          if (interactive) scale.value = withTiming(0.96, { duration: 110 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 140 });
        }}
        style={{ opacity: state === 'disabled' ? 0.6 : 1 }}
      >
        <View
          style={[
            styles.frame,
            {
              width: resolvedWidth,
              height: resolvedHeight,
              borderColor: accent,
              shadowColor: state === 'playable' || state === 'selected' ? palette.glow : colors.black,
            },
            state === 'selected' ? styles.frameSelected : null,
            state === 'playable' ? styles.framePlayable : null,
          ]}
        >
          <LinearGradient
            colors={artGradient}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.art}
          >
            <Text style={[styles.glyph, { fontSize: glyphSize, color: palette.glow }]}>
              {CARD_GLYPHS[cardId] ?? '符'}
            </Text>
            <View style={[styles.tick, styles.tickTopLeft]} />
            <View style={[styles.tick, styles.tickTopRight]} />
            <View style={[styles.tick, styles.tickBottomLeft]} />
            <View style={[styles.tick, styles.tickBottomRight]} />
          </LinearGradient>

          <View style={[styles.footer, { borderTopColor: accent }]}>
            <Text style={[styles.name, { fontSize: nameSize }]} numberOfLines={1}>
              {resolvedName}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {CATEGORY_LABELS[resolvedCategory] ?? resolvedCategory}
              {footnote ? ` · ${footnote}` : ''}
            </Text>
          </View>

          {stateLabel ? (
            <View
              style={[
                styles.stateTag,
                {
                  borderColor: accent,
                  backgroundColor:
                    state === 'disabled' ? 'rgba(145,166,160,0.22)' : 'rgba(6,25,27,0.86)',
                },
              ]}
            >
              <Text
                style={[
                  styles.stateText,
                  { color: state === 'disabled' ? colors.muted : colors.goldLight },
                ]}
              >
                {stateLabel}
              </Text>
            </View>
          ) : null}

          {cornerLabel ? (
            <View style={styles.cornerLabel}>
              <Text style={styles.cornerText}>{cornerLabel}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    borderWidth: borderWidth.thin,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  framePlayable: {
    borderWidth: borderWidth.thick,
    ...shadows.card,
  },
  frameSelected: {
    borderWidth: borderWidth.thick,
    transform: [{ translateY: -6 }],
  },
  art: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    opacity: 0.92,
  },
  tick: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderColor: colors.borderStrong,
  },
  tickTopLeft: { top: 4, left: 4, borderTopWidth: 1, borderLeftWidth: 1 },
  tickTopRight: { top: 4, right: 4, borderTopWidth: 1, borderRightWidth: 1 },
  tickBottomLeft: { bottom: 4, left: 4, borderBottomWidth: 1, borderLeftWidth: 1 },
  tickBottomRight: { bottom: 4, right: 4, borderBottomWidth: 1, borderRightWidth: 1 },
  footer: {
    borderTopWidth: borderWidth.hair,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(4,18,19,0.86)',
  },
  name: {
    color: colors.paper,
    fontFamily: fontFamily.title,
    fontWeight: '700',
    letterSpacing: 1,
  },
  meta: {
    color: colors.muted,
    fontFamily: fontFamily.body,
    fontSize: 9,
    marginTop: 1,
  },
  stateTag: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    borderWidth: borderWidth.hair,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs + 1,
    paddingVertical: 1,
  },
  stateText: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    fontWeight: '600',
  },
  cornerLabel: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    minWidth: 16,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(6,25,27,0.86)',
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  cornerText: {
    color: colors.goldLight,
    fontSize: 9,
    fontFamily: fontFamily.body,
  },
});

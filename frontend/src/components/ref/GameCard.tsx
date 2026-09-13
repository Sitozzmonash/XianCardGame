/**
 * 参考原型 `components/game/GameCard.tsx` 的 RN 移植（1:1）。
 *
 * 尺寸（参考 `SIZE_CLASS`）：sm 宽 70（圆角 12）、md 全宽（圆角 16）、lg 宽 248（圆角 24）；
 * 统一 `aspect-[3/4]` → 高度 = 宽 × 4/3。
 * 牌名位置：绝对贴底，`px-2 pb-2 pt-6`（顶部 24 是给渐变压暗留的过渡区）。
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { glowGold } from '@/components/ref/primitives';
import { artOf } from '@/theme/refAssets';
import { cream, gold, ink, jade, radius, rgba, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export type GameCardSize = 'sm' | 'md' | 'lg';

const WIDTH: Record<GameCardSize, number | 'full'> = { sm: 70, md: 'full', lg: 248 };
const RADIUS: Record<GameCardSize, number> = { sm: radius.xl, md: radius['2xl'], lg: radius['3xl'] };
const NAME_SIZE: Record<GameCardSize, number> = { sm: 11, md: 13, lg: 18 };
const NAME_TRACK: Record<GameCardSize, number> = { sm: 0.08, md: 0.1, lg: 0.14 };

export interface GameCardProps {
  /** 卡牌 id（后端 `card_id`，如 `STARGAZING`）；美术由 `refAssets` 解析 */
  cardId: string;
  name: string;
  subtitle?: string;
  size?: GameCardSize;
  selected?: boolean;
  dimmed?: boolean;
  /** 左上角序号（手牌用） */
  index?: number;
  onPress?: () => void;
  /** 强制不可交互（如牌不在 legal_actions 里） */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function GameCard({
  cardId,
  name,
  subtitle,
  size = 'md',
  selected,
  dimmed,
  index,
  onPress,
  disabled,
  style,
  testID,
}: GameCardProps) {
  const art = artOf(cardId);
  const interactive = Boolean(onPress) && !disabled;
  const width = WIDTH[size];
  const boxStyle: ViewStyle = {
    borderRadius: RADIUS[size],
    ...(width === 'full' ? { width: '100%' } : { width }),
    height: (width === 'full' ? 0 : width) * (4 / 3),
    ...(width === 'full' ? ({ aspectRatio: 3 / 4, height: undefined } as ViewStyle) : null),
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${name}${subtitle ? ` · ${subtitle}` : ''}`}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(selected) }}
      onPress={interactive ? onPress : undefined}
      disabled={!interactive}
      style={({ pressed }) => [
        styles.card,
        boxStyle,
        selected ? styles.selected : styles.idle,
        dimmed && styles.dimmed,
        pressed && interactive && styles.pressed,
        style,
      ]}
    >
      {art ? (
        <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noArt]} />
      )}

      {/* from-ink-950 via-ink-950/25 to-transparent */}
      <LinearGradient
        colors={['rgba(4,13,12,0.98)', 'rgba(4,13,12,0.25)', 'rgba(4,13,12,0)']}
        locations={[0, 0.42, 1]}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 内描边金环：`ring-1 ring-inset ring-gold-300/15` */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.innerRing, { borderRadius: RADIUS[size] }]} />

      {typeof index === 'number' ? (
        <View style={styles.indexBadge}>
          <Text allowFontScaling={false} style={styles.indexText}>
            {index}
          </Text>
        </View>
      ) : null}

      <View style={styles.nameWrap}>
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={[
            styles.name,
            { fontSize: NAME_SIZE[size], letterSpacing: track(NAME_TRACK[size], NAME_SIZE[size]) },
            glowGold(NAME_SIZE[size]),
          ]}
        >
          {name}
        </Text>
        {size !== 'sm' && subtitle ? (
          <Text allowFontScaling={false} numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** 牌背（牌堆叠卡 / 他人手牌） */
export function CardBack({ size = 'md', style, testID }: { size?: GameCardSize; style?: StyleProp<ViewStyle>; testID?: string }) {
  const width = WIDTH[size];
  const boxStyle: ViewStyle = {
    borderRadius: RADIUS[size],
    ...(width === 'full'
      ? ({ width: '100%', aspectRatio: 3 / 4 } as ViewStyle)
      : { width, height: width * (4 / 3) }),
  };

  return (
    <View testID={testID} style={[styles.card, boxStyle, styles.idle, style]} accessibilityElementsHidden>
      {/* radial-gradient(80% 60% at 50% 40%, #14503f 0%, #071614 75%) */}
      <LinearGradient
        colors={['#14503f', ink[900]]}
        start={{ x: 0.5, y: 0.2 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, styles.backInner, { borderRadius: RADIUS[size] }]} />
      <View style={styles.backCenter}>
        <View style={styles.backSeal}>
          <Text allowFontScaling={false} style={styles.backSealText}>
            劫
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: ink[900],
    justifyContent: 'flex-end',
  },
  idle: {
    borderColor: rgba(gold[500], 0.4),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.95,
    shadowRadius: 16,
    elevation: 4,
  },
  selected: {
    borderColor: gold[300],
    transform: [{ translateY: -4 }],
    shadowColor: gold[500],
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 8,
  },
  pressed: { transform: [{ translateY: -4 }] },
  dimmed: { opacity: 0.45 },
  noArt: { backgroundColor: ink[800] },
  innerRing: { borderWidth: 1, borderColor: 'rgba(232,213,168,0.15)' },

  indexBadge: {
    position: 'absolute',
    left: 6,
    top: 6,
    height: 20,
    width: 20,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: rgba(gold[400], 0.6),
    backgroundColor: rgba(ink[950], 0.8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { ...sans(600), fontSize: 10, color: gold[300] },

  nameWrap: { paddingHorizontal: 8, paddingBottom: 8, paddingTop: 24 },
  name: { ...serif(600), color: cream },
  subtitle: {
    ...sans(400),
    fontSize: 10,
    letterSpacing: track(0.025, 10),
    color: rgba(jade[300], 0.8),
    marginTop: 2,
  },

  backInner: { margin: 6, borderWidth: 1, borderColor: rgba(gold[500], 0.25), position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  backCenter: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  backSeal: {
    height: 32,
    width: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: rgba(gold[400], 0.5),
    backgroundColor: rgba(ink[950], 0.6),
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSealText: { ...serif(700), fontSize: 14, color: gold[300] },
});

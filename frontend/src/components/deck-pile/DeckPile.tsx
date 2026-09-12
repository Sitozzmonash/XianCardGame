/**
 * 牌堆（fig3_1：左侧「牌堆(N)」，N 用后端真实 `public.deck_count`）。
 *
 * 设计图上的 28 是错的 —— DESIGN_SPEC §4 强制要求一律用真实数字。
 * `known_top` 只渲染 observation 里「自己有权知道」的牌顶（别人的观星结果不下发）。
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { KnownTopCard } from '@/types/card';
import { cardNameOf } from '@/utils/card-catalog';

interface DeckPileProps {
  count: number;
  knownTop?: KnownTopCard[];
  highlighted?: boolean;
  onPress?: () => void;
  /** 由响应式布局给（设计基准 58 宽） */
  width?: number;
}

export function DeckPile({ count, knownTop = [], highlighted = false, onPress, width = 58 }: DeckPileProps) {
  const height = Math.round(width * 1.42);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={`牌堆剩余 ${count} 张${knownTop.length > 0 ? `，已知牌顶 ${knownTop.length} 张` : ''}`}
      disabled={!onPress}
      onPress={onPress}
      style={styles.wrapper}
    >
      <View style={[styles.stack, { width, height }]}>
        <View style={[styles.back, styles.backThird, { width, height }]} />
        <View style={[styles.back, styles.backSecond, { width, height }]} />
        <LinearGradient
          colors={highlighted ? ['#348470', '#123A32'] : ['#1E4350', '#0C1C24']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[
            styles.back,
            styles.backTop,
            { width, height },
            highlighted ? styles.highlight : null,
          ]}
        >
          <Text style={styles.glyph} allowFontScaling={false}>
            卜
          </Text>
        </LinearGradient>
      </View>

      <View style={styles.labelRow}>
        <Text style={styles.label} allowFontScaling={false}>
          牌堆
        </Text>
        <Text style={styles.count} allowFontScaling={false}>
          {count}
        </Text>
      </View>

      {knownTop.length > 0 ? (
        <View style={styles.knownList}>
          {knownTop.slice(0, 3).map((entry) => (
            <View key={`${entry.position}-${entry.card_id}`} style={styles.knownChip}>
              <Text style={styles.knownPosition} allowFontScaling={false}>
                {entry.position + 1}
              </Text>
              <Text style={styles.knownName} numberOfLines={1} allowFontScaling={false}>
                {entry.name ?? cardNameOf(entry.card_id)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.knownEmpty} allowFontScaling={false}>
          牌顶未知
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  stack: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  back: {
    position: 'absolute',
    borderRadius: radius.sm,
    borderWidth: borderWidth.hair,
    borderColor: 'rgba(120, 178, 196, 0.45)',
    backgroundColor: '#14262F',
  },
  backSecond: {
    transform: [{ translateX: 3 }, { translateY: 3 }],
    opacity: 0.7,
  },
  backThird: {
    transform: [{ translateX: 6 }, { translateY: 6 }],
    opacity: 0.45,
  },
  backTop: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: {
    borderColor: nightColors.jade,
  },
  glyph: {
    fontFamily: fontFamily.title,
    fontSize: 24,
    color: 'rgba(201, 166, 90, 0.9)',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginTop: 6,
  },
  label: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.celadon,
    letterSpacing: 1,
  },
  count: {
    fontFamily: fontFamily.title,
    fontSize: 14,
    fontWeight: '700',
    color: nightColors.cardEdge,
  },
  knownEmpty: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.muted,
    marginTop: 2,
  },
  knownList: {
    marginTop: 3,
    alignItems: 'center',
    maxWidth: 96,
  },
  knownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(78, 178, 148, 0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
    backgroundColor: 'rgba(7, 15, 20, 0.72)',
  },
  knownPosition: {
    fontFamily: fontFamily.body,
    fontSize: 8,
    color: nightColors.jade,
    marginRight: 3,
  },
  knownName: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.card,
  },
});

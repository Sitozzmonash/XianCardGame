import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, gradients } from '@/theme/colors';
import { borderWidth, radius, shadows, spacing } from '@/theme/spacing';
import { fontFamily, text } from '@/theme/typography';
import type { KnownTopCard } from '@/types/card';
import { cardNameOf } from '@/utils/card-catalog';

interface DeckPileProps {
  count: number;
  knownTop?: KnownTopCard[];
  highlighted?: boolean;
  onPress?: () => void;
}

/** 牌堆 + 自己已知的牌顶（observation.known_top，只显示自己有权知道的内容） */
export function DeckPile({ count, knownTop = [], highlighted = false, onPress }: DeckPileProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={`牌堆剩余 ${count} 张${
        knownTop.length > 0 ? `，已知牌顶 ${knownTop.length} 张` : ''
      }`}
      disabled={!onPress}
      onPress={onPress}
      style={styles.wrapper}
    >
      <View style={styles.stack}>
        <View style={[styles.back, styles.backThird]} />
        <View style={[styles.back, styles.backSecond]} />
        <LinearGradient
          colors={highlighted ? gradients.jade : gradients.cardArt}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.back, styles.backTop, highlighted ? styles.backHighlight : null]}
        >
          <Text style={styles.backGlyph}>卜</Text>
        </LinearGradient>
      </View>

      <Text style={styles.countLabel}>牌堆</Text>
      <Text style={styles.count}>{count}</Text>

      <View style={styles.knownList}>
        {knownTop.length === 0 ? (
          <Text style={styles.knownEmpty}>牌顶未知</Text>
        ) : (
          knownTop.map((entry) => (
            <View key={`${entry.position}-${entry.card_id}`} style={styles.knownChip}>
              <Text style={styles.knownPosition}>{entry.position + 1}</Text>
              <Text style={styles.knownName} numberOfLines={1}>
                {entry.name ?? cardNameOf(entry.card_id)}
              </Text>
            </View>
          ))
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  stack: {
    width: 62,
    height: 84,
    justifyContent: 'center',
    alignItems: 'center',
  },
  back: {
    position: 'absolute',
    width: 58,
    height: 80,
    borderRadius: radius.sm,
    borderWidth: borderWidth.thin,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
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
    ...shadows.card,
  },
  backHighlight: {
    borderColor: colors.jadeLight,
  },
  backGlyph: {
    fontFamily: fontFamily.title,
    fontSize: 26,
    color: colors.gold,
    opacity: 0.85,
  },
  countLabel: {
    ...text.label,
    marginTop: spacing.xs,
  },
  count: {
    ...text.bodyStrong,
    color: colors.goldLight,
  },
  knownList: {
    marginTop: spacing.xs,
    alignItems: 'center',
    maxWidth: 140,
  },
  knownEmpty: {
    ...text.label,
    fontSize: 10,
  },
  knownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: borderWidth.hair,
    borderColor: colors.jadeBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    marginTop: 2,
    backgroundColor: 'rgba(6,25,27,0.7)',
  },
  knownPosition: {
    ...text.label,
    fontSize: 9,
    color: colors.jadeLight,
    marginRight: 3,
  },
  knownName: {
    ...text.label,
    fontSize: 10,
    color: colors.paper,
  },
});

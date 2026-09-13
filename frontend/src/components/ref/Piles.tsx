/**
 * 参考原型 `components/game/Piles.tsx` 的 RN 移植（1:1）。
 * - `DeckPile`：三张牌背叠放（后两张偏移 1px/2px、透明度 40%/70%），下方「牌堆 (N)」。
 * - `DiscardPile`：70 宽卡位显示顶牌美术 + 中央大号张数。
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CardBack } from '@/components/ref/GameCard';
import { cream, creamFaint, gold, ink, radius, rgba } from '@/theme/ref';
import { sans } from '@/theme/refFonts';
import { artOf } from '@/theme/refAssets';
import { serif } from '@/theme/refFonts';

export function DeckPile({
  count,
  label = '牌堆',
  onPress,
}: {
  count: number;
  label?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}，剩余 ${count} 张`}
      onPress={onPress}
      disabled={!onPress}
      style={styles.pile}
    >
      <View style={styles.deckStack}>
        <CardBack size="sm" style={[styles.stackItem, { left: 4, top: 4, opacity: 0.4 }]} />
        <CardBack size="sm" style={[styles.stackItem, { left: 2, top: 2, opacity: 0.7 }]} />
        <CardBack size="sm" />
      </View>
      <Text allowFontScaling={false} style={styles.pileLabel}>
        {label} <Text style={{ color: gold[300] }}>({count})</Text>
      </Text>
    </Pressable>
  );
}

export function DiscardPile({
  count,
  label = '弃牌堆',
  topCardId,
  onPress,
}: {
  count: number;
  label?: string;
  /** 顶牌的卡牌 id（后端 card_id）；无则用渐变占位 */
  topCardId?: string | null;
  onPress?: () => void;
}) {
  const art = artOf(topCardId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}，共 ${count} 张`}
      onPress={onPress}
      disabled={!onPress}
      style={styles.pile}
    >
      <View style={styles.discardCard}>
        {art ? (
          <Image source={art} style={[StyleSheet.absoluteFill, { opacity: 0.8 }]} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[ink[700], ink[900]]}
            start={{ x: 0.5, y: 0.2 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(ink[950], 0.4) }]} />
        <View style={styles.discardCount}>
          <Text allowFontScaling={false} style={styles.discardCountText}>
            {count}
          </Text>
        </View>
      </View>
      <Text allowFontScaling={false} style={styles.pileLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pile: { alignItems: 'center', gap: 6 },
  deckStack: { position: 'relative', width: 70, height: 93.33 },
  stackItem: { position: 'absolute' },

  discardCard: {
    width: 70,
    height: 93.33,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.4),
    backgroundColor: ink[900],
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardCount: { alignItems: 'center', justifyContent: 'center' },
  discardCountText: { ...serif(700), fontSize: 24, color: 'rgba(236,227,207,0.7)' },

  pileLabel: { ...sans(400), fontSize: 10, letterSpacing: 0.5, color: creamFaint },
  creamText: { color: cream },
});

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { colors, gradients } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { fontFamily, text } from '@/theme/typography';
import { cardNameOf } from '@/utils/card-catalog';

interface DiscardPileProps {
  count: number;
  lastCardId?: string | null;
}

/** 弃牌堆：只显示数量与最上一张（公开信息） */
export function DiscardPile({ count, lastCardId }: DiscardPileProps) {
  return (
    <View
      style={styles.wrapper}
      accessibilityLabel={`弃牌堆 ${count} 张${lastCardId ? `，最上为${cardNameOf(lastCardId)}` : ''}`}
    >
      <LinearGradient
        colors={gradients.cardArt}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pile}
      >
        <Text style={styles.glyph}>{lastCardId ? cardNameOf(lastCardId).slice(0, 1) : '空'}</Text>
      </LinearGradient>

      <Text style={styles.label}>弃牌堆</Text>
      <Text style={styles.count}>{count}</Text>
      {lastCardId ? (
        <Text style={styles.last} numberOfLines={1}>
          {cardNameOf(lastCardId)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    opacity: 0.92,
  },
  pile: {
    width: 58,
    height: 80,
    borderRadius: radius.sm,
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: fontFamily.title,
    fontSize: 22,
    color: colors.muted,
  },
  label: {
    ...text.label,
    marginTop: spacing.xs,
  },
  count: {
    ...text.bodyStrong,
    color: colors.goldLight,
  },
  last: {
    ...text.label,
    fontSize: 10,
    maxWidth: 100,
  },
});

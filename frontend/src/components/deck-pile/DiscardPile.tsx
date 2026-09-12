/**
 * 弃牌堆（fig3_1：右侧「弃牌堆(N)」）。
 * 计数用后端真实 `public.discard_count`（DESIGN_SPEC §4：不得硬编码设计图的数字）。
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import { cardNameOf } from '@/utils/card-catalog';

interface DiscardPileProps {
  count: number;
  lastCardId?: string | null;
  /** 由响应式布局给（设计基准 58 宽） */
  width?: number;
}

export function DiscardPile({ count, lastCardId, width = 58 }: DiscardPileProps) {
  const height = Math.round(width * 1.42);

  return (
    <View
      style={styles.wrapper}
      accessibilityLabel={`弃牌堆 ${count} 张${lastCardId ? `，最上为${cardNameOf(lastCardId)}` : ''}`}
    >
      <LinearGradient
        colors={['#25404B', '#101E25']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.pile, { width, height }]}
      >
        <Text style={styles.glyph} allowFontScaling={false}>
          {lastCardId ? cardNameOf(lastCardId).slice(0, 1) : '空'}
        </Text>
      </LinearGradient>

      <View style={styles.labelRow}>
        <Text style={styles.label} allowFontScaling={false}>
          弃牌堆
        </Text>
        <Text style={styles.count} allowFontScaling={false}>
          {count}
        </Text>
      </View>
      {lastCardId ? (
        <Text style={styles.last} numberOfLines={1} allowFontScaling={false}>
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
    borderRadius: radius.sm,
    borderWidth: borderWidth.hair,
    borderColor: 'rgba(120, 178, 196, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: fontFamily.title,
    fontSize: 22,
    color: 'rgba(179, 212, 215, 0.7)',
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
  last: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.muted,
    maxWidth: 84,
  },
});

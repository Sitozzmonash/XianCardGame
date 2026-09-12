import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { nightColors, nightGradients } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
import type { CardCategory, CardSpec } from '@/types/card';
import { CARD_GLYPHS } from '@/utils/card-catalog';

import {
  RELATED_CARD,
  cardArtOf,
  typeGlyphOf,
  typeTintOf,
} from './card-visuals';

interface RelatedCardsProps {
  cards: CardSpec[];
  /** 每张卡的外宽（默认设计值 87.5） */
  cardWidth?: number;
  selectedId?: string;
  onSelect?: (card: CardSpec) => void;
  /** 小卡是否要在底部叠一条名字栏（设计稿是叠在卡内） */
  showNames?: boolean;
}

/**
 * 「相关卡牌」小卡（fig3_2 实测：每张 87.5×45、间距 10、四张一行、顶部一条金色细边）。
 * 名称叠在卡面底部；左上角是类型符点（替代设计稿的费用位）。
 */
export function RelatedCards({
  cards,
  cardWidth = RELATED_CARD.width,
  selectedId,
  onSelect,
  showNames = true,
}: RelatedCardsProps) {
  if (cards.length === 0) {
    return (
      <Text style={styles.empty} testID="related-empty">
        本类别暂无其它卡牌。
      </Text>
    );
  }

  const scale = cardWidth / RELATED_CARD.width;
  const s = (value: number) => value * scale;
  const height = s(RELATED_CARD.height);
  const gap = s(RELATED_CARD.gap);

  const row = (
    <View style={[styles.row, { gap }]}>
      {cards.map((card) => {
        const art = cardArtOf(card.id);
        const category = card.category as CardCategory;
        const selected = card.id === selectedId;
        return (
          <Pressable
            key={card.id}
            testID={`related-${card.id}`}
            accessibilityRole="button"
            accessibilityLabel={`相关卡牌 ${card.name}`}
            onPress={onSelect ? () => onSelect(card) : undefined}
            disabled={!onSelect}
            style={[
              styles.item,
              {
                width: cardWidth,
                height,
                borderRadius: s(RELATED_CARD.radius),
                borderColor: selected ? nightColors.celadon : nightColors.cardEdgeSoft,
                borderWidth: selected ? borderWidth.thin : borderWidth.hair,
              },
            ]}
          >
            {art ? (
              <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" transition={0} />
            ) : (
              <LinearGradient
                colors={nightGradients.battle}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.artFallback]}
              >
                <Text style={[styles.artGlyph, { fontSize: s(18), color: typeTintOf(category) }]}>
                  {CARD_GLYPHS[card.id] ?? '符'}
                </Text>
              </LinearGradient>
            )}

            {/* 类型符点 */}
            <View
              style={[
                styles.dot,
                {
                  width: s(12),
                  height: s(12),
                  borderRadius: s(6),
                  backgroundColor: typeTintOf(category),
                },
              ]}
            >
              <Text style={[styles.dotGlyph, { fontSize: s(8) }]}>{typeGlyphOf(category)}</Text>
            </View>

            {showNames ? (
              <View style={[styles.nameBar, { height: s(RELATED_CARD.nameBarHeight) }]}>
                <Text
                  style={[styles.name, { fontSize: s(RELATED_CARD.nameSize) }]}
                  numberOfLines={1}
                >
                  {card.name}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  // 小屏 / 多张卡时允许横向滚动，不挤压卡片比例
  return cards.length * (cardWidth + gap) > 380 ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {row}
    </ScrollView>
  ) : (
    row
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollContent: {
    paddingRight: spacing.sm,
  },
  item: {
    overflow: 'hidden',
    backgroundColor: nightColors.surface,
  },
  artFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  artGlyph: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    opacity: 0.9,
  },
  dot: {
    position: 'absolute',
    left: 3,
    top: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotGlyph: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: nightColors.white,
  },
  nameBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: nightColors.scrim,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  name: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: nightColors.card,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  empty: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: nightColors.muted,
  },
});

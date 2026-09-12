import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { nightColors, nightGradients } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';
import type { CardCategory, CardSpec } from '@/types/card';
import { CARD_GLYPHS } from '@/utils/card-catalog';

import {
  CARD_FACE,
  cardArtOf,
  typeGlyphOf,
  typeLabelOf,
  typeTintOf,
} from './card-visuals';

interface CardFaceProps {
  card: Pick<CardSpec, 'id' | 'name' | 'category'>;
  /**
   * 卡面**外框**宽度（含金边）。默认 240 = 设计稿 1x 原尺寸。
   * 内部所有间距按 240 → width 的比例等比缩放，因此任意尺寸都是同一套版式。
   */
  width?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * 米黄大卡面（fig3_2 实测几何）：
 *   金边外框 240×340 → 米黄内区 234×334，圆角 14；
 *   左上类型符点（Ø32）替代设计稿的费用位，卡名居中，插画 216×175 圆角 8，
 *   底部左侧为真实 category 中文（设计稿的「极品」品质位按 DESIGN_SPEC §4 隐藏）。
 */
export function CardFace({ card, width = CARD_FACE.width, style, testID }: CardFaceProps) {
  const scale = width / CARD_FACE.width;
  const s = (value: number) => value * scale;
  const inner = CARD_FACE.innerWidth * scale;
  const art = cardArtOf(card.id);
  const category = card.category as CardCategory;

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`卡牌 ${card.name}（${typeLabelOf(category)}）`}
      style={[
        styles.frame,
        {
          width,
          height: s(CARD_FACE.innerHeight + CARD_FACE.frame * 2),
          borderRadius: s(CARD_FACE.radius),
          borderWidth: s(CARD_FACE.frame),
        },
        style,
      ]}
    >
      <View style={styles.inner}>
        {/* 卡名（设计 y 127.5-145.5，居中） */}
        <Text
          style={[
            styles.name,
            {
              top: s(CARD_FACE.nameTop),
              fontSize: s(CARD_FACE.nameSize),
              left: s(CARD_FACE.pad),
              right: s(CARD_FACE.pad),
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {card.name}
        </Text>

        {/* 类型符点（设计 x 107-139 / y 120-151 → 卡面内 left 9 / top 9） */}
        <View
          style={[
            styles.dot,
            {
              width: s(CARD_FACE.dot),
              height: s(CARD_FACE.dot),
              borderRadius: s(CARD_FACE.dot / 2),
              left: s(CARD_FACE.pad),
              top: s(CARD_FACE.pad),
              backgroundColor: typeTintOf(category),
            },
          ]}
        >
          <Text style={[styles.dotGlyph, { fontSize: s(CARD_FACE.dot * 0.5) }]}>
            {typeGlyphOf(category)}
          </Text>
        </View>

        {/* 插画（设计 216×175，圆角 8） */}
        <View
          style={[
            styles.art,
            {
              left: s(CARD_FACE.pad),
              width: inner - s(CARD_FACE.pad * 2),
              top: s(CARD_FACE.artTop),
              height: s(CARD_FACE.artHeight),
              borderRadius: s(CARD_FACE.artRadius),
            },
          ]}
        >
          {art ? (
            <Image
              source={art}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={0}
              accessible={false}
            />
          ) : (
            /* 没有设计稿裁切的牌：渐变 + 符箓占位（DESIGN_SPEC §6，不留白框） */
            <LinearGradient
              colors={nightGradients.battle}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.artFallback]}
            >
              <Text style={[styles.artGlyph, { fontSize: s(64), color: typeTintOf(category) }]}>
                {CARD_GLYPHS[card.id] ?? '符'}
              </Text>
            </LinearGradient>
          )}
        </View>

        {/* 类型行（设计 y 358-372.5，左对齐） */}
        <Text
          style={[
            styles.typeLine,
            { top: s(CARD_FACE.typeTop), left: s(CARD_FACE.pad), fontSize: s(CARD_FACE.typeSize) },
          ]}
        >
          {typeLabelOf(category)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: nightColors.card,
    borderColor: nightColors.cardEdge,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
  },
  name: {
    position: 'absolute',
    textAlign: 'center',
    fontFamily: fontFamily.title,
    fontWeight: '700',
    letterSpacing: 1,
    color: nightColors.backgroundDeep,
  },
  dot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: nightColors.cardEdgeSoft,
  },
  dotGlyph: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: nightColors.white,
  },
  art: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: nightColors.surface,
    borderWidth: 1,
    borderColor: nightColors.cardEdgeSoft,
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
  typeLine: {
    position: 'absolute',
    fontFamily: fontFamily.body,
    letterSpacing: 1,
    color: nightColors.backgroundDeep,
    opacity: 0.82,
  },
});

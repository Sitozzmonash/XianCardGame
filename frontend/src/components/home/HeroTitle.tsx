/**
 * 首页主视觉文案层：主标题「天劫战牌」+ 副标题 + 标签行 + 两句 slogan。
 * 位置全部按设计原图实测坐标（见 design.ts），不靠目测。
 */
import { StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

import { HOME_GEOMETRY, type Canvas } from './design';

export interface HeroTitleProps {
  canvas: Canvas;
  title: string;
  subtitle: string;
  tags: readonly string[];
  slogans: readonly [string, string];
}

export function HeroTitle({ canvas, title, subtitle, tags, slogans }: HeroTitleProps) {
  const { dp } = canvas;
  const g = HOME_GEOMETRY;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* 主标题：鎏金衬线 + 外发光（Web 支持 textShadow） */}
      <Text
        style={[
          styles.title,
          {
            top: dp(g.title.y),
            fontSize: dp(g.title.size),
            lineHeight: dp(g.title.size * 1.1),
            letterSpacing: dp(g.title.letterSpacing),
            textShadowRadius: dp(14),
          },
        ]}
      >
        {title}
      </Text>

      <Text
        style={[
          styles.subtitle,
          {
            top: dp(g.subtitle.y),
            fontSize: dp(g.subtitle.size),
            lineHeight: dp(g.subtitle.size * 1.1),
            letterSpacing: dp(g.subtitle.letterSpacing),
          },
        ]}
      >
        {subtitle}
      </Text>

      <View style={[styles.tagRow, { top: dp(g.tags.y), height: dp(g.tags.h) }]}>
        {tags.map((tag) => (
          <View key={tag} style={[styles.tag, { height: dp(g.tags.h), borderRadius: dp(g.tags.h / 2) }]}>
            <Text style={[styles.tagText, { fontSize: dp(12) }]}>{tag}</Text>
          </View>
        ))}
      </View>

      <Text
        style={[
          styles.slogan,
          {
            left: dp(g.slogan1.x),
            top: dp(g.slogan1.y),
            fontSize: dp(g.slogan1.size),
            lineHeight: dp(g.slogan1.size * 1.1),
            textAlign: g.slogan1.align,
            textShadowRadius: dp(8),
          },
        ]}
      >
        {slogans[0]}
      </Text>
      <Text
        style={[
          styles.slogan,
          {
            left: dp(g.slogan2.x - 200),
            width: dp(200),
            top: dp(g.slogan2.y),
            fontSize: dp(g.slogan2.size),
            lineHeight: dp(g.slogan2.size * 1.1),
            textAlign: g.slogan2.align,
            textShadowRadius: dp(8),
          },
        ]}
      >
        {slogans[1]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: '#E7CE94',
    textShadowColor: 'rgba(201,166,90,0.75)',
    textShadowOffset: { width: 0, height: 0 },
  },
  subtitle: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    fontFamily: fontFamily.body,
    color: nightColors.celadonLight,
    textShadowColor: 'rgba(4,10,14,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  tagRow: {
    position: 'absolute',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    // 设计原图实测：标签胶囊是**米黄纸面**填充（1x y294 采样 ≈ (253,249,222)），不是深色胶囊
    borderColor: 'rgba(201,166,90,0.55)',
    backgroundColor: 'rgba(245,230,200,0.9)',
  },
  tagText: {
    fontFamily: fontFamily.body,
    fontWeight: '600',
    color: '#1A2C39',
    letterSpacing: 1,
  },
  slogan: {
    position: 'absolute',
    fontFamily: fontFamily.title,
    color: 'rgba(232,241,242,0.92)',
    letterSpacing: 3,
    textShadowColor: 'rgba(4,10,14,0.9)',
    textShadowOffset: { width: 0, height: 0 },
  },
});

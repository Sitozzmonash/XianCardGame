/**
 * 卡面插画：优先用设计图裁切（`theme/asset-map.ts`），没有裁切时用「渐变 + 符箓纹 + 印章字」
 * 的占位（DESIGN_SPEC §6 允许，不留白框）。
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, Text, View } from 'react-native';

import { battleArtFor, proceduralArtOf } from '@/theme/asset-map';
import { nightColors } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

interface CardArtProps {
  cardId: string;
  /** 置灰（不可用状态）：叠一层深色蒙版，作为「颜色以外」的可用性信号之一 */
  dimmed?: boolean;
  radius?: number;
  glyphSize?: number;
}

export function CardArt({ cardId, dimmed = false, radius = 4, glyphSize = 20 }: CardArtProps) {
  const source = battleArtFor(cardId);
  const fallback = proceduralArtOf(cardId);

  return (
    <View style={[styles.frame, { borderRadius: radius }]}>
      {source ? (
        <Image source={source} style={[StyleSheet.absoluteFill, styles.image]} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={fallback.gradient}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        >
          <View style={styles.seal}>
            <Text style={[styles.sealGlyph, { fontSize: glyphSize }]} allowFontScaling={false}>
              {fallback.glyph}
            </Text>
          </View>
          <View style={[styles.tick, styles.tickTopLeft]} />
          <View style={[styles.tick, styles.tickBottomRight]} />
        </LinearGradient>
      )}
      {dimmed ? <View style={[StyleSheet.absoluteFill, styles.dim]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: nightColors.backgroundDeep,
  },
  /**
   * RN Web 里 `<img>` 是替换元素：只给 absoluteFill（top/left/right/bottom:0）时宽度会取
   * 图片固有宽度，`right` 被忽略 → 插画会以原始尺寸溢出、只露出左上角。
   * 必须显式给 100%×100%，再靠 resizeMode="cover" 的 object-fit 铺满。
   */
  image: {
    width: '100%',
    height: '100%',
  },
  seal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealGlyph: {
    fontFamily: fontFamily.title,
    fontWeight: '700',
    color: 'rgba(245, 230, 200, 0.86)',
  },
  tick: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderColor: 'rgba(245, 230, 200, 0.45)',
  },
  tickTopLeft: { top: 3, left: 3, borderTopWidth: 1, borderLeftWidth: 1 },
  tickBottomRight: { bottom: 3, right: 3, borderBottomWidth: 1, borderRightWidth: 1 },
  dim: {
    backgroundColor: 'rgba(7, 15, 20, 0.62)',
  },
});

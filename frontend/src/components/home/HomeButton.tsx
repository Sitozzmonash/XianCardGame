/**
 * 首页按钮层（夜蓝青瓷色板）。
 *
 * 为什么不直接用 `src/components/ui/PrimaryButton`：那个组件写死了墨玉色板
 * （`colors.gold/goldLight/surface`），而首页是夜蓝色板。按任务约定，
 * 需要不同变体时在 `home/` 下写局部组件，不去改公共组件。
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nightColors, nightGradients } from '@/theme/colors';
import { fontFamily } from '@/theme/typography';

import { HOME_GEOMETRY, type Canvas } from './design';

export type HomeButtonTone = 'jade' | 'panel' | 'locked';

export interface HomeButtonProps {
  canvas: Canvas;
  label: string;
  sublabel?: string;
  tone: HomeButtonTone;
  x: number;
  y: number;
  w: number;
  h: number;
  disabled?: boolean;
  loading?: boolean;
  badge?: string;
  glyph?: string;
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
}

const TONE: Record<HomeButtonTone, { colors: readonly [string, string, ...string[]]; border: string; text: string }> = {
  jade: { colors: nightGradients.jadeButton, border: 'rgba(179,212,215,0.85)', text: nightColors.textStrong },
  panel: { colors: ['rgba(19,35,47,0.94)', 'rgba(7,15,20,0.94)'], border: 'rgba(120,178,196,0.4)', text: nightColors.text },
  // 设计原图实测：论道条的填充 ≈ (72,69,63)（1x y804 x40），比次按钮浅、比云雾深
  locked: { colors: ['#5A5C55', '#43453F'], border: 'rgba(240,232,210,0.34)', text: 'rgba(240,232,210,0.9)' },
};

export function HomeButton({
  canvas,
  label,
  sublabel,
  tone,
  x,
  y,
  w,
  h,
  disabled = false,
  loading = false,
  badge,
  glyph,
  onPress,
  accessibilityHint,
  testID,
}: HomeButtonProps) {
  const { dp } = canvas;
  const palette = TONE[tone];
  const inactive = disabled || loading;
  const locked = tone === 'locked' || disabled;

  return (
    <View
      style={{
        position: 'absolute',
        left: dp(x),
        top: dp(y),
        width: dp(w),
        height: dp(h),
      }}
    >
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, { borderRadius: dp(10) }, pressed ? styles.pressed : null]}
      >
        <LinearGradient
          colors={palette.colors}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[
            styles.gradient,
            { borderRadius: dp(10), borderColor: locked ? palette.border : palette.border, borderWidth: dp(1.2) },
          ]}
        >
          {glyph ? <Text style={[styles.glyph, { fontSize: dp(15) }]}>{glyph}</Text> : null}
          <View style={styles.labelBox}>
            <Text
              style={[styles.label, { fontSize: dp(tone === 'jade' ? 17 : 15), color: palette.text }]}
              numberOfLines={1}
            >
              {loading ? '处理中…' : label}
            </Text>
            {sublabel ? (
              <Text style={[styles.sublabel, { fontSize: dp(10) }]} numberOfLines={1}>
                {sublabel}
              </Text>
            ) : null}
          </View>
          {badge ? (
            <View style={[styles.badge, { borderRadius: dp(999), borderColor: 'rgba(232,241,242,0.4)' }]}>
              <Text style={[styles.badgeText, { fontSize: dp(9) }]}>{badge}</Text>
            </View>
          ) : null}
        </LinearGradient>
      </Pressable>
    </View>
  );
}

/** 首页底部工具行：小号文字按钮（保住旧首页的导航/数据源功能，视觉上退居次位） */
export function HomeTextLink({
  canvas,
  x,
  y,
  w,
  label,
  tone = 'muted',
  onPress,
  accessibilityHint,
  testID,
}: {
  canvas: Canvas;
  x: number;
  y: number;
  w: number;
  label: string;
  tone?: 'muted' | 'jade';
  onPress: () => void;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { dp } = canvas;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        { left: dp(x), top: dp(y), width: dp(w) },
        pressed ? styles.pressed : null,
      ]}
    >
      <Text
        style={[
          styles.linkText,
          { fontSize: dp(10), color: tone === 'jade' ? nightColors.jade : 'rgba(232,241,242,0.62)' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 首页四个圆形装饰徽记（设计原图 y75–101 的四个等距圆，非交互装饰） */
export function MedallionRow({ canvas, glyphs }: { canvas: Canvas; glyphs: readonly string[] }) {
  const { dp } = canvas;
  const { cy, d, centers } = HOME_GEOMETRY.medallions;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {centers.map((cx, index) => (
        <View
          key={cx}
          style={{
            position: 'absolute',
            left: dp(cx - d / 2),
            top: dp(cy - d / 2),
            width: dp(d),
            height: dp(d),
            borderRadius: dp(d / 2),
            borderWidth: dp(1),
            borderColor: 'rgba(120,178,196,0.42)',
            backgroundColor: 'rgba(22,94,78,0.34)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[styles.medallionGlyph, { fontSize: dp(12) }]}>{glyphs[index] ?? ''}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  labelBox: {
    alignItems: 'center',
  },
  label: {
    fontFamily: fontFamily.body,
    fontWeight: '600',
    letterSpacing: 2,
  },
  sublabel: {
    fontFamily: fontFamily.body,
    color: 'rgba(232,241,242,0.7)',
    letterSpacing: 1,
  },
  glyph: {
    fontFamily: fontFamily.title,
    color: 'rgba(245,230,200,0.9)',
    marginRight: 8,
  },
  badge: {
    position: 'absolute',
    right: 8,
    top: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: fontFamily.body,
    color: 'rgba(232,241,242,0.85)',
    letterSpacing: 1,
  },
  pressed: {
    opacity: 0.82,
  },
  link: {
    position: 'absolute',
    alignItems: 'center',
  },
  linkText: {
    fontFamily: fontFamily.body,
    letterSpacing: 1,
  },
  medallionGlyph: {
    fontFamily: fontFamily.title,
    color: 'rgba(179,212,215,0.9)',
  },
});

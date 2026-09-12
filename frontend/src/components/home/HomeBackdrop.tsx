/**
 * 首页背景：夜色云雾（渐层重建）+ 法阵辉光 + 设计图裁切的山石/立绘 + 底部浅色云雾。
 *
 * 依据 DESIGN_SPEC §6：设计图上半段被标题/副标题/标签文字压住，无法裁切，
 * 因此用「渐层 + 法阵纹理」重建；中段（设计 y 400–641）无文字，直接用裁切位图；
 * 下段（设计 y 641–932）被按钮/免责小字压住，同样用渐层承接。
 *
 * 每层渐层色都取自设计原图逐行实测的平均色（不是目测）：
 *   画布(1x) y  0–143  晨雾天空  ≈ (151,154,143) → (154,161,150)，中间有 (124,138,124) 的冷雾
 *   画布(1x) y143      硬边分界（设计 y187 一夜成墨）
 *   画布(1x) y143–356  夜色 → 青瓷天光  ≈ #0A1526 → (133,165,184)
 *   画布(1x) y597–888  浅色云雾  ≈ (168,172,160) → 底部 (156,158,146)
 */
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { nightColors } from '@/theme/colors';

import { HOME_ART_ASPECT, HOME_ART_SOURCE } from './assets';
import { HOME_GEOMETRY, type Canvas } from './design';

/** 晨雾天空（含设计原图里那层冷绿雾的明暗起伏） */
const SKY_GRADIENT = ['#979A8F', '#7E8C7E', '#979B90', '#828E82', '#9AA196'] as const;
/** 夜色主视觉上段：夜蓝 → 青瓷天光 */
const NIGHT_GRADIENT = ['#0A1526', '#1D3956', '#3E6A8B', '#6D96B0', '#8FB4C9'] as const;
/**
 * 裁切位图以下的浅色云雾：按设计图**内容列之外**（1x x6–20 / x410–424）逐行实测的背景色。
 * 这一段在设计图里是「深橄榄灰 → 浅米灰」的渐层，不是均匀的浅色。
 */
const BOTTOM_GRADIENT = [
  '#58738B', '#3F5A68', '#2C414F', '#5C5C53', '#57564D', '#635F56',
  '#6E6B63', '#847F76', '#938D81', '#A39E90', '#ACA597', '#ACA393',
] as const;
const BOTTOM_LOCATIONS = [0, 0.062, 0.113, 0.165, 0.268, 0.371, 0.474, 0.577, 0.68, 0.784, 0.887, 1] as const;

function RuneRings({ canvas }: { canvas: Canvas }) {
  const { dp } = canvas;
  const { cx, cy, r } = HOME_GEOMETRY.rune;
  const x = dp(cx - r);
  const y = dp(cy - r);
  const size = dp(r * 2);
  // 用同心圆近似径向辉光（LinearGradient 只有线性，RN 无原生径向渐变）。
  // 设计原图里这个法阵核心接近纯白（实测 #FAFDFF），所以内圈透明度要给足。
  const steps = Array.from({ length: 10 }, (_, index) => ({
    ratio: 1 - index * 0.095,
    alpha: 0.09 + index * 0.056,
  }));
  return (
    <View pointerEvents="none" style={[styles.rune, { left: x, top: y, width: size, height: size }]}>
      {steps.map(({ ratio, alpha }, index) => {
        const d = size * ratio;
        return (
          <View
            key={index}
            style={{
              position: 'absolute',
              left: (size - d) / 2,
              top: (size - d) / 2,
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: `rgba(233,248,246,${alpha.toFixed(3)})`,
            }}
          />
        );
      })}
      {[1, 0.78, 0.56, 0.34].map((ratio, index) => (
        <View
          key={`ring-${index}`}
          style={{
            position: 'absolute',
            left: (size - size * ratio) / 2,
            top: (size - size * ratio) / 2,
            width: size * ratio,
            height: size * ratio,
            borderRadius: (size * ratio) / 2,
            borderWidth: index === 0 ? dp(1.2) : dp(0.8),
            borderColor: `rgba(179,212,215,${index === 0 ? 0.55 : 0.3 - index * 0.06})`,
          }}
        />
      ))}
    </View>
  );
}

export function HomeBackdrop({ canvas }: { canvas: Canvas }) {
  const { dp } = canvas;
  const sky = HOME_GEOMETRY.sky;
  const visualTop = HOME_GEOMETRY.visualTop;
  const art = HOME_GEOMETRY.art;
  const bottom = HOME_GEOMETRY.bottomMist;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* 云海晨雾（画布 y0–143） */}
      <LinearGradient
        colors={SKY_GRADIENT}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{ position: 'absolute', left: dp(sky.x), top: dp(sky.y), width: dp(sky.w), height: dp(sky.h) }}
      />
      {/* 夜色主视觉上段（画布 y143–356） */}
      <LinearGradient
        colors={NIGHT_GRADIENT}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          left: dp(visualTop.x),
          top: dp(visualTop.y),
          width: dp(visualTop.w),
          height: dp(visualTop.h),
        }}
      />
      <RuneRings canvas={canvas} />
      {/* 山石 / 云雾 / 立绘（设计图裁切位图，与上段渐层同宽无缝相接） */}
      <Image
        source={HOME_ART_SOURCE}
        resizeMode="cover"
        style={{
          position: 'absolute',
          left: dp(art.x),
          top: dp(art.y),
          width: dp(art.w),
          height: dp(art.w) / HOME_ART_ASPECT,
        }}
      />
      {/* 裁切位图以下的云雾（按钮与免责小字压在这一层上） */}
      <LinearGradient
        colors={BOTTOM_GRADIENT}
        locations={BOTTOM_LOCATIONS}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: 'absolute',
          left: dp(bottom.x),
          top: dp(bottom.y),
          width: dp(bottom.w),
          height: dp(bottom.h),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rune: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 供页面根节点复用：整体底色（裁切画面下方的兜底色） */
  fallback: {
    backgroundColor: nightColors.background,
  },
});

/**
 * 首页主角立绘 —— 对应参考 `components/screens/HomeScreen.tsx` 第 13–24 行：
 *
 *   <div className="pointer-events-none absolute inset-x-0 bottom-[150px] top-[92px] overflow-hidden">
 *     <img src="/hero-cultivator.png" className="h-full w-full object-cover object-top opacity-90"
 *          style={{ maskImage: 'radial-gradient(75% 70% at 50% 45%, #000 45%, transparent 100%)' }} />
 *   </div>
 *
 * RN 没有 `mask-image`，按移植规格 §3 用 react-native-svg 的 `Mask` + `RadialGradient` 复刻羽化
 * （比叠一层径向遮罩更准）；`object-cover object-top` → `preserveAspectRatio="xMidYMin slice"`。
 *
 * 渐变几何（CSS 里 `radial-gradient(75% 70% at 50% 45%)` 的两个百分比是**半径**）：
 *   cx = 50% W、cy = 45% H、rx = 75% W、ry = 70% H，色标 45% 不透明 → 100% 全透明。
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Image as SvgImage, Mask, RadialGradient, Rect, Stop } from 'react-native-svg';

import { HERO_ART } from '@/theme/refAssets';

export function HeroArt() {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  return (
    <View
      pointerEvents="none"
      style={styles.wrap}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width > 0 && height > 0) {
          setBox((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
        }
      }}
    >
      {box ? (
        <Svg width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`}>
          <Defs>
            <RadialGradient
              id="hero-feather"
              gradientUnits="userSpaceOnUse"
              cx={box.w * 0.5}
              cy={box.h * 0.45}
              rx={box.w * 0.75}
              ry={box.h * 0.7}
            >
              <Stop offset="45%" stopColor="#ffffff" stopOpacity={1} />
              <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
            <Mask id="hero-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={box.w} height={box.h}>
              <Rect x={0} y={0} width={box.w} height={box.h} fill="url(#hero-feather)" />
            </Mask>
          </Defs>
          <SvgImage
            href={HERO_ART}
            x={0}
            y={0}
            width={box.w}
            height={box.h}
            preserveAspectRatio="xMidYMin slice"
            opacity={0.9}
            mask="url(#hero-mask)"
          />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 92,
    bottom: 150,
    overflow: 'hidden',
  },
});

/**
 * 标题可读性遮罩 —— 对应参考 `HomeScreen.tsx` 第 37–38 行的注释与那一层：
 *
 *   {/* Scrim keeps the title legible over the bright key art. *\/}
 *   <div className="pointer-events-none absolute inset-0
 *        bg-[radial-gradient(65%_42%_at_50%_50%,rgba(4,13,12,0.88)_0%,rgba(4,13,12,0.5)_55%,transparent_100%)]" />
 *
 * CSS 的两个百分比是椭圆**半径**：rx = 65% W、ry = 42% H；色标 0% / 55% / 100%。
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/** 遮罩底色 = ink-950（参考里写的是 `rgba(4,13,12,·)`，即 ink[950] 的同值字面量） */
const SCRIM = '#040d0c';

export function TitleScrim({ width, height }: { width: number; height: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <RadialGradient
            id="home-title-scrim"
            gradientUnits="userSpaceOnUse"
            cx={width * 0.5}
            cy={height * 0.5}
            rx={width * 0.65}
            ry={height * 0.42}
          >
            <Stop offset="0%" stopColor={SCRIM} stopOpacity={0.88} />
            <Stop offset="55%" stopColor={SCRIM} stopOpacity={0.5} />
            <Stop offset="100%" stopColor={SCRIM} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#home-title-scrim)" />
      </Svg>
    </View>
  );
}

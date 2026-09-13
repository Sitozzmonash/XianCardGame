/**
 * CSS 装饰圆的 RN 等价物（移植规格 §3：`blur-2xl/xl` 的彩色光晕 → SVG 径向渐变）。
 *
 * 参考里有两处用到：
 * - `CounterModal.tsx` 第 39 行 `absolute -inset-5 rounded-full bg-blood-500/25 blur-2xl`（血光晕）
 * - 卡牌详情大卡背后的玉绿光晕（本目录的 `CardActionModal` 复用）
 *
 * 用 `viewBox` 归一化尺寸 + 百分比径向渐变，外层容器自己决定大小（可负偏移），
 * 这样同一组件既能做圆形也能做椭圆（参考的 `rounded-full` 在非正方形盒子上就是椭圆）。
 */

import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

export function SoftGlow({
  color,
  /** 渐变最内圈的不透明度（参考 `bg-blood-500/25` 这类 0.25 的色块，`blur-2xl` 把边缘化开） */
  opacity = 0.25,
  style,
}: {
  color: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // react-native-svg 的 url(#id) 引用要避开花括号（useId 形如 ':r1:'），这里做一次净化
  const id = `glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="55%" stopColor={color} stopOpacity={opacity * 0.55} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** 参考里 `shadow-[0_0_0_1px_rgba(232,213,168,0.5)]` 的选中描边（RN 无 spread shadow，用内环复刻） */
export function SelectionRing({ radius, inset = -1 }: { radius: number; inset?: number }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: inset,
        left: inset,
        right: inset,
        bottom: inset,
        borderRadius: radius + Math.abs(inset),
        borderWidth: 1,
        borderColor: 'rgba(232,213,168,0.5)',
      }}
    />
  );
}

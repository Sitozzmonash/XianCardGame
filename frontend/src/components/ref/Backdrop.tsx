/**
 * 参考原型 `components/game/Backdrop.tsx` 的 RN 移植（1:1 几何）。
 *
 * - `MagicCircle`：SVG 原样搬运（内外两圈反向自转 90s / 160s，24 齿 + 8 齿刻度线）。
 * - `MountainRange`：两条山脊 path 原样复制，`preserveAspectRatio="none"` 拉伸到屏宽。
 * - `CloudLayer`：参考用 CSS `blur-3xl` 做云带；RN 无 CSS blur，改用**SVG 径向渐变**做同等柔边，
 *   并保留 26s / 40s 反向漂移动画（这是少数刻意近似处，已记录在移植规格里）。
 * - `GameBackdrop`：参考的 `radial-gradient(120% 80% at 50% -10%)` 用 `preserveAspectRatio="none"`
 *   + `userSpaceOnUse` 的椭圆径向渐变复刻（线性渐变做不出椭圆）。
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { circleSoft, circleStroke, ink } from '@/theme/ref';

// ---------------------------------------------------------------- 法阵

export function MagicCircle({
  size = 300,
  tone = 'jade',
  spin = true,
  style,
}: {
  size?: number;
  tone?: 'jade' | 'gold';
  spin?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const stroke = circleStroke[tone];
  const soft = circleSoft[tone];

  const outer = useSharedValue(0);
  const inner = useSharedValue(0);

  useEffect(() => {
    if (!spin) return;
    outer.value = withRepeat(withTiming(360, { duration: 90000, easing: Easing.linear }), -1, false);
    inner.value = withRepeat(withTiming(-360, { duration: 160000, easing: Easing.linear }), -1, false);
  }, [spin, outer, inner]);

  const outerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${outer.value}deg` }] }));
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${inner.value}deg` }] }));

  const teeth24 = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return {
      x1: 200 + Math.cos(a) * 150,
      y1: 200 + Math.sin(a) * 150,
      x2: 200 + Math.cos(a) * 168,
      y2: 200 + Math.sin(a) * 168,
    };
  });
  const teeth8 = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return {
      x1: 200 + Math.cos(a) * 112,
      y1: 200 + Math.sin(a) * 112,
      x2: 200 + Math.cos(a) * 128,
      y2: 200 + Math.sin(a) * 128,
    };
  });

  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 400 400">
        <Defs>
          <RadialGradient id={`mc-core-${tone}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={stroke} stopOpacity={0.55} />
            <Stop offset="45%" stopColor={stroke} stopOpacity={0.12} />
            <Stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Circle cx={200} cy={200} r={190} fill={`url(#mc-core-${tone})`} />
      </Svg>

      {/* 外圈（90s 顺时针）：圆心固定在容器中心，用绝对定位的两层动画组实现自转 */}
      <Animated.View style={[StyleSheet.absoluteFill, outerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 400 400">
          <Circle cx={200} cy={200} r={186} fill="none" stroke={soft} strokeWidth={1} />
          <Circle
            cx={200}
            cy={200}
            r={176}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray="2 10"
            strokeOpacity={0.7}
          />
          <Circle cx={200} cy={200} r={150} fill="none" stroke={soft} strokeWidth={1} />
          {teeth24.map((t, i) => (
            <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={stroke} strokeOpacity={0.5} strokeWidth={1} />
          ))}
        </Svg>
      </Animated.View>

      {/* 内圈（160s 逆时针） */}
      <Animated.View style={[StyleSheet.absoluteFill, innerStyle]}>
        <Svg width={size} height={size} viewBox="0 0 400 400">
          <Circle cx={200} cy={200} r={128} fill="none" stroke={stroke} strokeWidth={1} strokeOpacity={0.55} />
          <Circle
            cx={200}
            cy={200}
            r={112}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            strokeDasharray="14 8"
            strokeOpacity={0.45}
          />
          {teeth8.map((t, i) => (
            <Line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={stroke} strokeOpacity={0.6} strokeWidth={1.5} />
          ))}
        </Svg>
      </Animated.View>

      <View style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size} viewBox="0 0 400 400">
          <Circle cx={200} cy={200} r={86} fill="none" stroke={stroke} strokeWidth={1} strokeOpacity={0.4} />
          <Circle cx={200} cy={200} r={60} fill="none" stroke={stroke} strokeWidth={1} strokeOpacity={0.3} />
        </Svg>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- 山峦 / 云层

export function MountainRange({ opacity = 1 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={[styles.mountainWrap, { opacity }]}>
      <Svg width="100%" height="100%" viewBox="0 0 430 200" preserveAspectRatio="none">
        <Path
          d="M0 200 L0 120 L38 74 L70 108 L104 52 L142 100 L176 66 L214 112 L252 58 L292 104 L326 78 L364 116 L400 84 L430 122 L430 200 Z"
          fill={ink[850]}
        />
        <Path
          d="M0 200 L0 152 L44 116 L82 146 L120 104 L160 142 L200 112 L244 150 L286 118 L330 152 L372 124 L430 158 L430 200 Z"
          fill={ink[900]}
        />
      </Svg>
    </View>
  );
}

/** 单条云带：自带漂移动画（hooks 必须在该组件顶层调用） */
function CloudBand({
  color,
  id,
  duration,
  style: boxStyle,
}: {
  color: string;
  id: string;
  duration: number;
  style: StyleProp<ViewStyle>;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [duration, t]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ translateX: -0.03 * 430 * t.value }, { translateY: -0.02 * 932 * t.value }],
  }));

  return (
    <Animated.View style={[styles.cloud, boxStyle, anim]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.1} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={40} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/** 云带（用 SVG 径向渐变近似 CSS blur-3xl） */
export function CloudLayer() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <CloudBand
        id="cloud-jade-500"
        color="#248a6e"
        duration={26000}
        style={{ top: '25%', left: '-25%', width: '150%', height: 160 }}
      />
      <CloudBand
        id="cloud-gold-500"
        color="#c9a86a"
        duration={40000}
        style={{ top: '50%', right: '-25%', width: '140%', height: 128 }}
      />
      <CloudBand
        id="cloud-jade-400"
        color="#35a184"
        duration={26000}
        style={{ bottom: '25%', left: 0, width: '130%', height: 144 }}
      />
    </View>
  );
}

// ---------------------------------------------------------------- 整体背景

export function GameBackdrop({ variant = 'plain' }: { variant?: 'home' | 'plain' }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* 底色：深墨玉 → 近黑 */}
      <LinearGradient
        colors={[ink[900], ink[950]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 顶部椭圆径向绿光：复刻 radial-gradient(120% 80% at 50% -10%) */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="bd-top" gradientUnits="userSpaceOnUse" cx={50} cy={-10} r={70}>
              <Stop offset="0%" stopColor="#0f3d30" stopOpacity={1} />
              <Stop offset="45%" stopColor="#071614" stopOpacity={0.85} />
              <Stop offset="100%" stopColor="#040d0c" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={100} height={100} fill="url(#bd-top)" />
        </Svg>
      </View>

      {/* 首页右上角金色光晕（参考是 blur-2xl/xl 的两个金圆） */}
      {variant === 'home' ? (
        <Svg width="100%" height="100%" viewBox="0 0 430 932" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="glow-gold-big" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#e8d5a8" stopOpacity={0.25} />
              <Stop offset="100%" stopColor="#e8d5a8" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="glow-gold-small" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#e8d5a8" stopOpacity={0.4} />
              <Stop offset="100%" stopColor="#e8d5a8" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={380} cy={-10} r={170} fill="url(#glow-gold-big)" />
          <Circle cx={370} cy={24} r={96} fill="url(#glow-gold-small)" />
        </Svg>
      ) : null}

      <CloudLayer />
      <MountainRange opacity={variant === 'plain' ? 0.5 : 0.85} />

      {/* 上下压暗：from-ink-950/40 via-transparent to-ink-950/80 */}
      <LinearGradient
        colors={['rgba(4,13,12,0.4)', 'rgba(4,13,12,0)', 'rgba(4,13,12,0.8)']}
        locations={[0, 0.5, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mountainWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 200 },
  cloud: { position: 'absolute' },
});

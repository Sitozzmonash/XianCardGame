/**
 * 结算页居中区（1:1 复刻参考 `components/screens/ResultScreen.tsx:44-56`）。
 *
 * 参考：
 *   `<div className="relative flex flex-col items-center">`
 *     + MagicCircle 240（绝对居中，`translate(-50%,-50%)`）
 *     + PlayerAvatar size="lg"
 *     + h2 24px 衬线 700 字距 0.14em text-cream text-glow-gold（`mt-4`）
 *     + p 11px 无衬线 字距 0.2em text-jade-300/85（`mt-1`）
 * 差异仅一处：原型把头像的渐变座位写死 `seat={4}`，这里用**真实胜者座位号**
 * （`PlayerAvatar` 的 6 套渐变按 seat 轮转），其余几何/字号/颜色逐值对应。
 */

import { StyleSheet, Text, View } from 'react-native';

import { MagicCircle } from '@/components/ref/Backdrop';
import { PlayerAvatar } from '@/components/ref/PlayerAvatar';
import { glowGold } from '@/components/ref/primitives';
import { cream, jade, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

const CIRCLE = 240;

export function ResultHero({
  name,
  subtitle,
  seat,
  tone,
}: {
  name: string;
  subtitle: string;
  seat: number;
  tone: 'gold' | 'jade';
}) {
  return (
    <View style={styles.wrap}>
      {/* 法阵绝对居中：`left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2` */}
      <MagicCircle size={CIRCLE} tone={tone} spin style={styles.circle} />

      {/* 头像 / 名字 / 副标题在法阵之上（RN 里后渲染的兄弟节点在上层） */}
      <PlayerAvatar name={name} size="lg" seat={seat} />
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.name, glowGold(24)]}>
        {name}
      </Text>
      <Text allowFontScaling={false} numberOfLines={1} style={styles.subtitle}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  circle: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -CIRCLE / 2,
    marginTop: -CIRCLE / 2,
  },
  name: {
    ...serif(700),
    marginTop: sp(4),
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: track(0.14, 24),
    color: cream,
  },
  subtitle: {
    ...sans(400),
    marginTop: sp(1),
    fontSize: 11,
    letterSpacing: track(0.2, 11),
    color: rgba(jade[300], 0.85),
  },
});

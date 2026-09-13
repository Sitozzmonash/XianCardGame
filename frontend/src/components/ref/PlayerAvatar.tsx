/**
 * 参考原型 `components/game/PlayerAvatar.tsx` 的 RN 移植（1:1）。
 * 6 套渐变按座位号轮转（`bg-gradient-to-br`），首字居中，外圈一圈淡金细环。
 */

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ink, gold, radius, rgba } from '@/theme/ref';
import { serif } from '@/theme/refFonts';

const TONES: [string, string][] = [
  ['#1b6b55', '#0c2420'], // from-jade-600 to-ink-800
  ['#a8874a', '#0c2420'], // from-gold-600 to-ink-800
  ['#248a6e', '#0f3d30'], // from-jade-500 to-jade-800
  ['#3a5f7a', '#0c2420'],
  ['#6b4a7a', '#0c2420'],
  ['#7a5a3a', '#0c2420'],
];

const DIMS = {
  sm: { box: 36, text: 14 },
  md: { box: 48, text: 18 },
  lg: { box: 80, text: 30 },
} as const;

export function PlayerAvatar({
  name,
  size = 'md',
  seat = 0,
  alive = true,
  style,
}: {
  name: string;
  size?: keyof typeof DIMS;
  seat?: number;
  alive?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const dim = DIMS[size];
  const colors = TONES[seat % TONES.length];

  return (
    <View style={[{ width: dim.box, height: dim.box }, style]}>
      <View
        style={[
          styles.circle,
          {
            width: dim.box,
            height: dim.box,
            borderRadius: radius.full,
            opacity: alive ? 1 : 0.5,
          },
        ]}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text allowFontScaling={false} style={[styles.initial, { fontSize: dim.text }]}>
          {name.slice(0, 1)}
        </Text>
      </View>
      <View pointerEvents="none" style={[styles.ring, { borderRadius: radius.full }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.5),
  },
  initial: { ...serif(700), color: '#ece3cf' },
  ring: {
    position: 'absolute',
    top: -2,
    right: -2,
    bottom: -2,
    left: -2,
    borderWidth: 1,
    borderColor: 'rgba(232,213,168,0.2)',
  },
});

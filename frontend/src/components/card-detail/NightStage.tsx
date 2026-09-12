import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsive } from '@/hooks/use-responsive';
import { nightColors, nightGradients } from '@/theme/colors';
import { layout } from '@/theme/spacing';

interface NightStageProps {
  contentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
}

/**
 * 夜蓝青瓷色板的页面外壳（首页 / 对局 / 卡牌图鉴 / 卡牌详情专用）。
 * 与 ScreenBackground 的差别：用 `nightGradients.detail`（#040506→#0E1A22），
 * 即 fig3_2 的实测底色；ScreenBackground 只会给出墨玉色板渐变。
 */
export function NightStage({ children, contentStyle, maxWidth }: PropsWithChildren<NightStageProps>) {
  const { width, height } = useResponsive();
  const max = maxWidth ?? layout.maxContentWidth;
  const glow = Math.min(width * 0.7, 340);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={nightGradients.detail}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View
          style={[
            styles.glow,
            {
              width: glow,
              height: glow,
              borderRadius: glow / 2,
              top: -glow * 0.42,
              right: -glow * 0.2,
            },
          ]}
        />
        <View style={[styles.ring, { bottom: -height * 0.14, left: -width * 0.22 }]} />
      </View>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={[styles.content, { maxWidth: max }, contentStyle]}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: nightColors.backgroundDeep,
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(120,178,196,0.05)',
  },
  ring: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    borderWidth: 1,
    borderColor: nightColors.hairline,
  },
});

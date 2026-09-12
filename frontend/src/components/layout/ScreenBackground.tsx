import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsive } from '@/hooks/use-responsive';
import { colors, gradients, nightColors, nightGradients } from '@/theme/colors';
import { layout, spacing } from '@/theme/spacing';

type Variant = 'home' | 'battle' | 'plain';
/** 色板维度（DESIGN_SPEC §2）：`ink` = 墨玉（对战配置 / 结算 / AI 实验室 / 404）；
 *  `night` = 夜蓝青瓷（首页 / 对局 / 图鉴 / 卡牌详情）。 */
type Tone = 'ink' | 'night';

interface ScreenBackgroundProps {
  variant?: Variant;
  /** 色板维度，默认 `ink`（墨玉）。夜蓝色板的页面必须显式传 `night`。 */
  tone?: Tone;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
  /** 是否显示背景装饰（月色光斑 + 法阵环） */
  decorative?: boolean;
}

/** 夜蓝色板没有「plain」这一档，统一落到详情页的近乎纯黑。 */
function gradientFor(variant: Variant, tone: Tone) {
  if (tone === 'ink') return gradients[variant];
  if (variant === 'battle') return nightGradients.battle;
  if (variant === 'home') return nightGradients.home;
  return nightGradients.detail;
}

/**
 * 页面外壳：渐变水墨底 + 安全的 SafeAreaView + 居中最大宽度容器。
 * 参考图只作气质参考，不透传整张位图（FRONTEND_GUIDE §9）。
 */
export function ScreenBackground({
  children,
  variant = 'plain',
  tone = 'ink',
  scroll = false,
  contentStyle,
  maxWidth,
  decorative = true,
}: PropsWithChildren<ScreenBackgroundProps>) {
  const { width, height, isWide } = useResponsive();
  const moonSize = Math.min(width * 0.62, 320);
  const resolvedMaxWidth =
    maxWidth ?? (isWide && variant === 'battle' ? layout.maxBattleWidth : layout.maxContentWidth);
  const background = tone === 'night' ? nightColors.background : colors.background;

  const content = (
    <View style={[styles.content, { maxWidth: resolvedMaxWidth }, contentStyle]}>{children}</View>
  );

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <LinearGradient
        colors={gradientFor(variant, tone) as unknown as readonly [string, string, ...string[]]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {decorative ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View
            style={[
              styles.moon,
              {
                width: moonSize,
                height: moonSize,
                borderRadius: moonSize / 2,
                top: -moonSize * 0.32,
                right: -moonSize * 0.18,
              },
            ]}
          />
          <View style={[styles.ring, { bottom: -height * 0.12, left: -width * 0.2 }]} />
          <View style={[styles.ringSmall, { bottom: height * 0.04, right: -width * 0.16 }]} />
        </View>
      ) : null}
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {content}
          </ScrollView>
        ) : (
          <View style={styles.staticContent}>{content}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
  staticContent: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  moon: {
    position: 'absolute',
    backgroundColor: 'rgba(232,222,197,0.05)',
  },
  ring: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    borderWidth: 1,
    borderColor: 'rgba(87,179,164,0.10)',
  },
  ringSmall: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: 'rgba(201,166,90,0.10)',
  },
});

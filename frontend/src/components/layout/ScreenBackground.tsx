import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResponsive } from '@/hooks/use-responsive';
import { colors, gradients } from '@/theme/colors';
import { layout, spacing } from '@/theme/spacing';

type Variant = 'home' | 'battle' | 'plain';

interface ScreenBackgroundProps {
  variant?: Variant;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  maxWidth?: number;
  /** 是否显示背景装饰（月色光斑 + 法阵环） */
  decorative?: boolean;
}

/**
 * 页面外壳：渐变水墨底 + 安全的 SafeAreaView + 居中最大宽度容器。
 * 参考图只作气质参考，不透传整张位图（FRONTEND_GUIDE §9）。
 */
export function ScreenBackground({
  children,
  variant = 'plain',
  scroll = false,
  contentStyle,
  maxWidth,
  decorative = true,
}: PropsWithChildren<ScreenBackgroundProps>) {
  const { width, height, isWide } = useResponsive();
  const moonSize = Math.min(width * 0.62, 320);
  const resolvedMaxWidth =
    maxWidth ?? (isWide && variant === 'battle' ? layout.maxBattleWidth : layout.maxContentWidth);

  const content = (
    <View style={[styles.content, { maxWidth: resolvedMaxWidth }, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={gradients[variant]}
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

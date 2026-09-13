/**
 * 页面骨架：背景三件套 + 安全区 + 底部操作栏 + 可滚动主体。
 *
 * 对应参考原型里每一屏重复出现的那三行结构：
 *   `<GameBackdrop variant="plain" />` + `relative z-10 flex-1 overflow-y-auto px-5 pb-6 pt-5`
 *   + `border-t border-gold-500/15 bg-ink-950/70 px-5 py-4 backdrop-blur-sm`
 * （RN 里 `backdrop-blur` 用 `expo-blur` 的 BlurView 近似。）
 */

import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { GameBackdrop } from '@/components/ref/Backdrop';
import { gold, ink, rgba, sp } from '@/theme/ref';

export function ScreenShell({
  children,
  variant = 'plain',
  edges = ['top', 'left', 'right'],
  style,
}: {
  children: ReactNode;
  variant?: 'home' | 'plain';
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={styles.root}>
      <GameBackdrop variant={variant} />
      <SafeAreaView style={[styles.safe, style]} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

/** 页面主体（可滚动）：对应 `flex-1 overflow-y-auto px-5 pb-6 pt-5` */
export function ScrollBody({
  children,
  gap = sp(5),
  style,
  contentStyle,
  scroll = true,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
}) {
  if (!scroll) {
    return <View style={[styles.body, { gap }, style, contentStyle]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.body, style]}
      contentContainerStyle={[{ gap, paddingBottom: sp(6) }, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** 底部操作栏：对应 `border-t border-gold-500/15 bg-ink-950/70 px-5 py-4 backdrop-blur-sm` */
export function BottomBar({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.bottomBar, style]}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgba(ink[950], 0.7) }]} />
      <View style={styles.bottomBarInner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ink[950] },
  safe: { flex: 1 },
  body: { flex: 1, paddingHorizontal: sp(5), paddingTop: sp(5) },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: rgba(gold[500], 0.15),
    overflow: 'hidden',
  },
  bottomBarInner: { paddingHorizontal: sp(5), paddingVertical: sp(4), gap: sp(3) },
});

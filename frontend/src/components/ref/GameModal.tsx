/**
 * 参考原型 `components/game/GameModal.tsx` 的 RN 移植（1:1）。
 *
 * 版式：底部升起的面板（宽 ≤400），圆角只在顶部 24；`tone` 决定 jade/blood 两套渐变与标题色；
 * 顶部一条金发丝线；内容区最高 52vh（RN 用 `Dimensions` 计算）；底部按钮两列由调用方给 `footer`。
 * 动画：遮罩 fade 0.3s、面板 rise（translateY 14→0 + opacity）0.45s cubic-bezier(0.22,1,0.36,1)。
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, type ReactNode } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CloseIcon } from '@/components/ref/Icons';
import { GoldHairline, glowGold } from '@/components/ref/primitives';
import { creamDim, gold, ink, radius, refGradients, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export function GameModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  tone = 'jade',
  style,
  testID,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  tone?: 'jade' | 'blood';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const rise = useSharedValue(0);
  const windowHeight = Dimensions.get('window').height;
  const maxContentHeight = Math.round(windowHeight * 0.52);

  useEffect(() => {
    rise.value = open ? withTiming(1, { duration: 450, easing: Easing.bezier(0.22, 1, 0.36, 1) }) : 0;
  }, [open, rise]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * 14 }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({ opacity: rise.value }));

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root} testID={testID}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭"
            onPress={onClose}
            style={[StyleSheet.absoluteFill, styles.backdrop]}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            { borderColor: tone === 'blood' ? rgba('#a13a3a', 0.5) : rgba(gold[500], 0.4) },
            panelStyle,
            style,
          ]}
        >
          <LinearGradient
            colors={tone === 'blood' ? refGradients.modalBlood : refGradients.modalJade}
            locations={[0, 0.6]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.hairlineWrap}>
            <GoldHairline />
          </View>

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text
                allowFontScaling={false}
                style={[styles.title, { color: tone === 'blood' ? '#e8b0a0' : gold[300] }, glowGold(20)]}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text allowFontScaling={false} style={styles.subtitle}>
                  {subtitle}
                </Text>
              ) : null}
            </View>

            {onClose ? (
              <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={styles.closeBtn}>
                <CloseIcon size={14} color="#6f8479" />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            style={{ maxHeight: maxContentHeight }}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { backgroundColor: rgba(ink[950], 0.8) },
  panel: {
    width: '100%',
    maxWidth: 400,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderWidth: 1,
    padding: sp(5),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.95,
    shadowRadius: 30,
    elevation: 24,
  },
  hairlineWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3), marginBottom: sp(4) },
  headerText: { flexShrink: 1, minWidth: 0 },
  title: { ...serif(700), fontSize: 20, letterSpacing: track(0.12, 20) },
  subtitle: { ...sans(400), fontSize: 12, lineHeight: 18, color: creamDim, marginTop: sp(1) },
  closeBtn: {
    height: 28,
    width: 28,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.35),
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingBottom: 2 },
  footer: { flexDirection: 'row', gap: sp(3), marginTop: sp(5) },
});

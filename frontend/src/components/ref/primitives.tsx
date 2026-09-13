/**
 * 参考原型 `components/game/primitives.tsx` 的 RN 移植（1:1）。
 * Tailwind 类 → RN 值的换算规则见 `docs/FRONTEND_PORT_SPEC.md` §2/§3。
 *
 * 共同约定：
 * - 渐变一律 `expo-linear-gradient`，色标与参考一致；
 * - 圆角/间距/字距用 `@/theme/ref` 的 `radius` / `sp` / `track`；
 * - 字体用 `serif()` / `sans()` 助手（每个字重是独立 family）；
 * - 参考的 `hover:` 在移动端无意义（不移植），`active:scale-[0.985]` 用 Pressable 实现。
 */

import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { ChevronLeftIcon } from '@/components/ref/Icons';
import { cream, creamDim, creamFaint, gold, ink, jade, radius, refGradients, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

// ---------------------------------------------------------------- 基础件

/** `.gold-hairline`：两端透明、中间鎏金的 1px 发丝线 */
export function GoldHairline({
  style,
  opacity = 1,
  height = 1,
}: {
  style?: StyleProp<ViewStyle>;
  opacity?: number;
  height?: number;
}) {
  return (
    <LinearGradient
      colors={['rgba(201,168,106,0)', 'rgba(201,168,106,0.55)', 'rgba(232,213,168,0.85)', 'rgba(201,168,106,0.55)', 'rgba(201,168,106,0)']}
      locations={[0, 0.22, 0.5, 0.78, 1]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[{ height, width: '100%', opacity }, style]}
    />
  );
}

/** `.text-glow-gold`（RN 只支持单层阴影，取主光晕近似） */
export function glowGold(fontSize: number): TextStyle {
  return {
    textShadowColor: 'rgba(201,168,106,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: Math.max(8, fontSize * 0.35),
  };
}

/** `.panel`：双层渐变底 + 金边 + 内高光 */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.panel, style]}>
      <LinearGradient
        colors={refGradients.panel}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.panelInner}>{children}</View>
    </View>
  );
}

// ---------------------------------------------------------------- 按钮

interface ButtonProps {
  children: ReactNode;
  onPress?: () => void;
  fullWidth?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** 覆盖文字（如对局页的「结束回合」用金底黑字） */
  textColor?: string;
  /** 用金色渐变替代玉绿渐变（对局页「结束回合」） */
  tone?: 'jade' | 'gold';
}

/** 玉绿主按钮（可切金色，用于「结束回合」） */
export function PrimaryButton({
  children,
  onPress,
  fullWidth,
  disabled,
  style,
  textStyle,
  textColor,
  tone = 'jade',
}: ButtonProps) {
  const goldTone = tone === 'gold';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.primary,
        goldTone ? styles.primaryGold : styles.primaryJade,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <LinearGradient
        colors={goldTone ? refGradients.goldButton : refGradients.primaryButton}
        locations={goldTone ? [0, 0.55, 1] : [0, 0.55, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* 顶部金发丝线：`inset-x-3 top-0 h-px` */}
      <LinearGradient
        colors={['rgba(232,213,168,0)', 'rgba(232,213,168,0.7)', 'rgba(232,213,168,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.buttonTopLine}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.primaryText,
          { color: goldTone ? ink[950] : '#f2fbf6' },
          textColor ? { color: textColor } : null,
          textStyle,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

/** 次级按钮（墨玉底 + 金边） */
export function SecondaryButton({
  children,
  onPress,
  fullWidth,
  disabled,
  style,
  textStyle,
}: ButtonProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.secondary,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[styles.secondaryText, textStyle]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- 标签 / 标题

export type TagTone = 'jade' | 'gold' | 'blood' | 'muted';

export function StatusTag({
  children,
  tone = 'jade',
  style,
  textStyle,
}: {
  children: ReactNode;
  tone?: TagTone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.tag, TAG_TONE[tone].box, style]}>
      <Text allowFontScaling={false} style={[styles.tagText, TAG_TONE[tone].text, textStyle]}>
        {children}
      </Text>
    </View>
  );
}

const TAG_TONE: Record<TagTone, { box: ViewStyle; text: TextStyle }> = {
  jade: {
    box: { borderColor: rgba(jade[400], 0.5), backgroundColor: rgba(jade[600], 0.25) },
    text: { color: jade[300] },
  },
  gold: {
    box: { borderColor: rgba(gold[500], 0.5), backgroundColor: rgba(gold[600], 0.15) },
    text: { color: gold[300] },
  },
  blood: {
    box: { borderColor: rgba('#a13a3a', 0.6), backgroundColor: rgba('#5e1f1f', 0.3) },
    text: { color: '#e8a9a9' },
  },
  muted: {
    box: { borderColor: rgba(creamFaint, 0.3), backgroundColor: rgba(ink[800], 0.6) },
    text: { color: creamDim },
  },
};

export function SectionTitle({
  children,
  action,
  style,
}: {
  children: ReactNode;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionTitle, style]}>
      <Text allowFontScaling={false} style={styles.sectionTitleText}>
        {children}
      </Text>
      {action}
    </View>
  );
}

// ---------------------------------------------------------------- 选择器

export function SegmentedSelector<T extends string | number>({
  options,
  value,
  onChange,
  formatLabel,
  size = 'md',
  style,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  formatLabel?: (value: T) => string;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segRow, style]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={String(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={[styles.segBase, size === 'sm' ? styles.segSm : styles.segMd, active ? styles.segActive : styles.segIdle]}
          >
            {active ? (
              <LinearGradient
                colors={refGradients.segmentActive}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
            <Text
              allowFontScaling={false}
              style={[
                styles.segText,
                size === 'sm' ? styles.segTextSm : styles.segTextMd,
                active ? styles.segTextActive : styles.segTextIdle,
              ]}
            >
              {formatLabel ? formatLabel(option) : String(option)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AISelector({
  options,
  value,
  onChange,
  style,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.aiRow, style]} accessibilityRole="radiogroup">
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={[styles.aiChip, active ? styles.aiChipActive : styles.aiChipIdle]}
          >
            <Text
              allowFontScaling={false}
              style={[styles.aiChipText, active ? { color: gold[300] } : { color: creamFaint }]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- 页头 / 图标按钮

/** 36×36 圆形金边按钮（设置 / 返回） */
export function IconButton({
  label,
  onPress,
  children,
  style,
}: {
  label: string;
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }, style]}
    >
      {children}
    </Pressable>
  );
}

/** 页头：eyebrow + 30px 衬线大标题 + 金发丝线 + 可选返回/右侧插槽 */
export function TopBar({
  eyebrow,
  title,
  onBack,
  right,
  style,
}: {
  eyebrow?: string;
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.topBar, style]}>
      <View style={styles.topBarRow}>
        <View style={styles.topBarLeft}>
          {eyebrow ? (
            <Text allowFontScaling={false} style={styles.topBarEyebrow}>
              {eyebrow}
            </Text>
          ) : null}
          <Text allowFontScaling={false} style={[styles.topBarTitle, glowGold(30)]}>
            {title}
          </Text>
        </View>
        <View style={styles.topBarRight}>
          {right}
          {onBack ? (
            <IconButton label="返回" onPress={onBack}>
              <ChevronLeftIcon size={16} color={creamDim} />
            </IconButton>
          ) : null}
        </View>
      </View>
      <GoldHairline style={{ marginTop: sp(3) }} />
    </View>
  );
}

// ---------------------------------------------------------------- 样式

const styles = StyleSheet.create({
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ scale: 0.985 }] },

  panel: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.28),
    backgroundColor: 'rgba(8,24,21,0.86)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 6,
  },
  panelInner: { padding: sp(4) },

  primary: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.6),
    paddingHorizontal: sp(6),
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryJade: {
    shadowColor: jade[500],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryGold: {
    shadowColor: gold[500],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.95,
    shadowRadius: 14,
    elevation: 8,
  },
  buttonTopLine: {
    position: 'absolute',
    left: sp(3),
    right: sp(3),
    top: 0,
    height: 1,
  },
  primaryText: {
    ...serif(600),
    fontSize: 18,
    letterSpacing: track(0.18, 18),
  },

  secondary: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.45),
    backgroundColor: rgba(ink[850], 0.7),
    paddingHorizontal: sp(6),
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    ...serif(500),
    fontSize: 18,
    letterSpacing: track(0.18, 18),
    color: cream,
  },

  tag: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  tagText: { ...sans(500), fontSize: 11, letterSpacing: track(0.05, 11) },

  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp(3),
  },
  sectionTitleText: {
    ...serif(600),
    fontSize: 15,
    letterSpacing: track(0.14, 15),
    color: gold[300],
  },

  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(2) },
  segBase: {
    borderRadius: radius.full,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segSm: { paddingHorizontal: 14, paddingVertical: 6 },
  segMd: { paddingHorizontal: sp(4), paddingVertical: sp(2) },
  segActive: {
    borderColor: rgba(gold[400], 0.7),
    shadowColor: jade[500],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.95,
    shadowRadius: 10,
    elevation: 5,
  },
  segIdle: { borderColor: rgba(gold[500], 0.35), backgroundColor: rgba(ink[850], 0.6) },
  segText: { ...serif(400), letterSpacing: track(0.05, 14) },
  segTextSm: { fontSize: 13, letterSpacing: track(0.05, 13) },
  segTextMd: { fontSize: 14 },
  segTextActive: { color: '#f2fbf6' },
  segTextIdle: { color: creamDim },

  aiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aiChip: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: sp(1),
  },
  aiChipActive: { borderColor: rgba(gold[400], 0.7), backgroundColor: rgba(jade[600], 0.4) },
  aiChipIdle: { borderColor: rgba(gold[500], 0.25), backgroundColor: rgba(ink[900], 0.6) },
  aiChipText: { ...sans(500), fontSize: 11, letterSpacing: track(0.025, 11) },

  iconButton: {
    height: 36,
    width: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.4),
    backgroundColor: rgba(ink[850], 0.7),
    alignItems: 'center',
    justifyContent: 'center',
  },

  topBar: { paddingHorizontal: sp(5), paddingTop: sp(6) },
  topBarRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: sp(3) },
  topBarLeft: { flexShrink: 1, minWidth: 0 },
  topBarEyebrow: {
    ...sans(500),
    fontSize: 11,
    letterSpacing: track(0.3, 11),
    color: rgba(jade[300], 0.8),
  },
  topBarTitle: {
    ...serif(700),
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: track(0.06, 30),
    color: cream,
    marginTop: sp(1),
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: sp(2), paddingTop: sp(1) },
});

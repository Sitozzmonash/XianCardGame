/**
 * 夜蓝青瓷色板面板（对局页专用变体；不替换共享的 `ui/Panel.tsx`）。
 */
import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

export type NightTone = 'surface' | 'panel' | 'deep' | 'transparent';
export type NightAccent = 'celadon' | 'jade' | 'gold' | 'danger' | 'none';

interface NightPanelProps {
  tone?: NightTone;
  accent?: NightAccent;
  title?: string;
  subtitle?: string;
  padded?: boolean;
  /** 自定义圆角（设计图多为 10-14） */
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TONE_BG: Record<NightTone, string> = {
  surface: 'rgba(19, 35, 47, 0.92)',
  panel: 'rgba(38, 62, 77, 0.88)',
  deep: 'rgba(7, 15, 20, 0.88)',
  transparent: nightColors.transparent,
};

const ACCENT_BORDER: Record<NightAccent, string> = {
  celadon: nightColors.hairline,
  jade: 'rgba(78, 178, 148, 0.55)',
  gold: nightColors.cardEdgeSoft,
  danger: nightColors.dangerSoft,
  none: nightColors.transparent,
};

// `nightColors` 里的 hairline/dangerSoft 等派生色在别处也可能被复用，这里仅取描边语义
export function NightPanel({
  children,
  tone = 'surface',
  accent = 'celadon',
  title,
  subtitle,
  padded = true,
  cornerRadius = radius.md,
  style,
  testID,
}: PropsWithChildren<NightPanelProps>) {
  return (
    <View
      testID={testID}
      style={[
        styles.panel,
        {
          backgroundColor: TONE_BG[tone],
          borderColor: ACCENT_BORDER[accent],
          borderRadius: cornerRadius,
        },
        padded ? styles.padded : null,
        style,
      ]}
    >
      {title ? (
        <Text style={[styles.title, accent === 'gold' ? styles.titleGold : null]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: borderWidth.hair,
  },
  padded: {
    padding: 10,
  },
  title: {
    fontFamily: fontFamily.title,
    fontSize: 12,
    fontWeight: '700',
    color: nightColors.celadon,
    letterSpacing: 1,
    marginBottom: 6,
  },
  titleGold: {
    color: nightColors.cardEdge,
  },
  subtitle: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
    marginBottom: 6,
  },
});

/**
 * 夜蓝青瓷色板小标签（对局页专用变体；不替换共享的 `ui/Badge.tsx`）。
 */
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

export type NightTagTone = 'jade' | 'gold' | 'celadon' | 'muted' | 'danger' | 'dark';

interface NightTagProps {
  label: string;
  tone?: NightTagTone;
  /** 实心（玉绿底 + 深色字）/ 描边 */
  solid?: boolean;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TONE: Record<NightTagTone, { border: string; text: string; fill: string }> = {
  jade: { border: 'rgba(78, 178, 148, 0.7)', text: nightColors.jade, fill: nightColors.jade },
  gold: { border: nightColors.cardEdgeSoft, text: nightColors.cardEdge, fill: nightColors.gold },
  celadon: { border: nightColors.border, text: nightColors.celadon, fill: nightColors.celadon },
  muted: { border: 'rgba(143, 163, 173, 0.35)', text: nightColors.muted, fill: 'rgba(143,163,173,0.5)' },
  danger: { border: nightColors.dangerSoft, text: nightColors.dangerText, fill: nightColors.danger },
  dark: { border: nightColors.hairline, text: nightColors.text, fill: nightColors.backgroundDeep },
};

export function NightTag({
  label,
  tone = 'celadon',
  solid = false,
  fontSize = 10,
  style,
  testID,
}: NightTagProps) {
  const palette = TONE[tone];
  return (
    <View
      testID={testID}
      style={[
        styles.tag,
        {
          borderColor: solid ? palette.fill : palette.border,
          backgroundColor: solid ? palette.fill : 'rgba(7, 15, 20, 0.66)',
        },
        style,
      ]}
    >
      <Text
        style={[styles.label, { color: solid ? '#07130F' : palette.text, fontSize }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: borderWidth.hair,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: fontFamily.body,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

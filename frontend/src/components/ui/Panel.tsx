import { PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

type Tone = 'surface' | 'jade' | 'gold' | 'danger' | 'transparent';

interface PanelProps {
  title?: string;
  tone?: Tone;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONE_BACKGROUND: Record<Tone, string> = {
  surface: colors.surface,
  jade: colors.surfaceRaised,
  gold: colors.surface,
  danger: 'rgba(164,66,61,0.16)',
  transparent: colors.transparent,
};

const TONE_BORDER: Record<Tone, string> = {
  surface: colors.border,
  jade: colors.jadeBorder,
  gold: colors.borderStrong,
  danger: colors.dangerBorder,
  transparent: colors.transparent,
};

export function Panel({
  children,
  title,
  tone = 'surface',
  padded = true,
  style,
}: PropsWithChildren<PanelProps>) {
  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: TONE_BACKGROUND[tone],
          borderColor: TONE_BORDER[tone],
        },
        padded && styles.padded,
        style,
      ]}
    >
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: borderWidth.hair,
    borderRadius: radius.lg,
  },
  padded: {
    padding: spacing.md,
  },
  title: {
    ...text.gold,
    marginBottom: spacing.sm,
  },
});

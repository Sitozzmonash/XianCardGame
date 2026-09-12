import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

import { SectionRule } from './SectionRule';

interface LabHeaderProps {
  title: string;
  subtitle: string;
  /** 右侧返回回调（由页面注入，保持组件不依赖 router） */
  onBack: () => void;
}

/** AI 实验室页头：标题 + 副题 + 鎏金分隔线（设计图 fig4_0 的标题区气质） */
export function LabHeader({ title, subtitle, onBack }: LabHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Text
          accessibilityRole="button"
          accessibilityLabel="返回上一页"
          onPress={onBack}
          style={styles.back}
          suppressHighlighting
        >
          ‹ 返回
        </Text>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.spacer} />
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <SectionRule />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  back: {
    ...text.caption,
    color: colors.goldLight,
    minWidth: 72,
    minHeight: 44,
    lineHeight: 44,
  },
  title: {
    ...text.title,
    fontSize: 22,
  },
  spacer: {
    minWidth: 72,
  },
  subtitle: {
    ...text.label,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
});

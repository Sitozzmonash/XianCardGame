import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';

interface BattleLogProps {
  lines: string[];
  height?: number;
}

/** 战斗日志：events 播放完之后仍然可以回看（动画只是表现，日志是可读事实） */
export function BattleLog({ lines, height = 96 }: BattleLogProps) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [lines.length]);

  return (
    <View style={[styles.wrapper, { height }]}>
      <Text style={styles.title}>战斗日志</Text>
      <ScrollView ref={ref} style={styles.scroll} showsVerticalScrollIndicator={false}>
        {lines.length === 0 ? (
          <Text style={styles.empty}>暂无事件</Text>
        ) : (
          lines.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.line}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: 'rgba(4,18,19,0.72)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  title: {
    ...text.label,
    color: colors.goldLight,
    marginBottom: 2,
  },
  scroll: {
    flex: 1,
  },
  line: {
    ...text.label,
    fontSize: 10,
    color: colors.textFaint,
    marginBottom: 2,
  },
  empty: {
    ...text.label,
    fontSize: 10,
  },
});

/**
 * 战斗日志：事件播完仍可回看（动画只是表现，日志是可读事实）。
 */
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

interface BattleLogProps {
  lines: string[];
  /** 给定高度则固定；不给则填满父容器（对战页中区弹性伸缩） */
  height?: number;
}

export function BattleLog({ lines, height }: BattleLogProps) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [lines.length]);

  return (
    <View style={[styles.wrapper, height !== undefined ? { height } : styles.flexible]}>
      <View style={styles.header}>
        <Text style={styles.title} allowFontScaling={false}>
          战斗日志
        </Text>
        <Text style={styles.count} allowFontScaling={false}>
          {lines.length} 条
        </Text>
      </View>
      <ScrollView ref={ref} style={styles.scroll} showsVerticalScrollIndicator={false}>
        {lines.length === 0 ? (
          <Text style={styles.empty} allowFontScaling={false}>
            暂无事件
          </Text>
        ) : (
          lines.map((line, index) => (
            <Text key={`${index}-${line}`} style={styles.line} allowFontScaling={false}>
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
    borderColor: nightColors.hairline,
    borderRadius: radius.md,
    backgroundColor: 'rgba(7, 15, 20, 0.66)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  flexible: {
    flex: 1,
    minHeight: 64,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    fontFamily: fontFamily.title,
    fontSize: 11,
    color: nightColors.celadon,
    letterSpacing: 1,
  },
  count: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.muted,
  },
  scroll: {
    flex: 1,
  },
  line: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: 'rgba(232, 241, 242, 0.72)',
    marginBottom: 2,
  },
  empty: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
  },
});

/**
 * 统计三列（1:1 复刻参考 `components/screens/ResultScreen.tsx:58-65`）。
 *
 * 参考：`<Panel className="grid grid-cols-3 divide-x divide-gold-500/15 py-4">`
 *   → 每列 `flex flex-col items-center gap-1.5`，标签 11px 无衬线 字距 0.2em text-cream-faint，
 *     数值 30px 衬线 700 text-gold-300 text-glow-gold。
 * `p-4` + `py-4` 相抵（都是 16px），所以这里直接用 `Panel` 自带的 16px 内边距，
 * 分隔线按 `divide-x` 语义手写：第 2、3 列加 1px 左边框 `rgba(201,168,106,0.15)`。
 *
 * 数值全部来自 `resultStatsOf(view)`（`public.round` / `public.discard_count` /
 * 事件流里的 `TRIBULATION_DRAWN`），拿不到就显示「—」；每个格子带无障碍说明交代口径。
 */

import { StyleSheet, Text, View } from 'react-native';

import { Panel, glowGold } from '@/components/ref/primitives';
import type { ResultStat } from '@/components/ref/screens/result/result-data';
import { creamFaint, gold, rgba, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export function ResultStats({ stats }: { stats: readonly ResultStat[] }) {
  return (
    <Panel>
      <View style={styles.row}>
        {stats.map((stat, index) => (
          <View
            key={stat.label}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${stat.label} ${stat.value}`}
            accessibilityHint={stat.hint}
            style={[styles.col, index > 0 ? styles.divider : null]}
          >
            <Text allowFontScaling={false} style={styles.label}>
              {stat.label}
            </Text>
            <Text allowFontScaling={false} style={[styles.value, glowGold(30)]}>
              {stat.value}
            </Text>
          </View>
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  divider: { borderLeftWidth: 1, borderLeftColor: rgba(gold[500], 0.15) },
  label: { ...sans(400), fontSize: 11, letterSpacing: track(0.2, 11), color: creamFaint },
  value: { ...serif(700), fontSize: 30, lineHeight: 36, color: gold[300] },
});

/**
 * 最终排名（1:1 复刻参考 `components/screens/ResultScreen.tsx:67-83`）。
 *
 * 参考：`SectionTitle 最终排名` + 每行 `rounded-xl border-gold-500/20 bg-ink-850/60 px-3.5 py-2.5`
 *   → 名次 `w-5 font-serif text-sm font-bold text-gold-400`
 *   → 名字 `min-w-0 flex-1 truncate font-serif text-sm text-cream`
 *   → `StatusTag` 存活（jade）/ 淘汰（muted）。
 * 名次不写死：见 `rankingOf()`（胜者第一，其余存活者按座位序，淘汰者按 PLAYER_ELIMINATED 的先后倒序）。
 */

import { StyleSheet, Text, View } from 'react-native';

import { SectionTitle, StatusTag } from '@/components/ref/primitives';
import type { RankEntry } from '@/components/ref/screens/result/result-data';
import { cream, gold, ink, radius, rgba, sp } from '@/theme/ref';
import { serif } from '@/theme/refFonts';

export function ResultRanking({ entries }: { entries: readonly RankEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionTitle>最终排名</SectionTitle>
      <View style={styles.list}>
        {entries.map((entry) => (
          <View
            key={entry.playerId}
            accessible
            accessibilityLabel={`第 ${entry.rank} 名 ${entry.name} ${entry.alive ? '存活' : '淘汰'}`}
            style={styles.row}
          >
            <Text allowFontScaling={false} style={styles.rank}>
              {entry.rank}
            </Text>
            <Text allowFontScaling={false} numberOfLines={1} style={styles.name}>
              {entry.name}
            </Text>
            <StatusTag tone={entry.alive ? 'jade' : 'muted'}>{entry.alive ? '存活' : '淘汰'}</StatusTag>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: sp(3) },
  list: { gap: sp(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.2),
    backgroundColor: rgba(ink[850], 0.6),
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rank: { width: 20, ...serif(700), fontSize: 14, color: gold[400] },
  name: { flex: 1, minWidth: 0, ...serif(400), fontSize: 14, color: cream },
});

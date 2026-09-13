/**
 * 自己状态条 —— 参考 `BattleScreen.tsx` 第 72–82 行原样移植。
 *
 *   第 73 行 `mx-4 flex items-center gap-3 rounded-2xl border border-gold-500/35 bg-ink-950/70 px-3.5 py-2.5`
 *   第 74 行 `PlayerAvatar size="sm"`
 *   第 76-78 行 `truncate 14px serif 600`「我（名字）」
 *   第 79 行 `10px sans tracking-wide text-cream-faint`「手牌 N 张」
 *   第 81 行 `StatusTag tone="gold"`「仙途」
 */

import { StyleSheet, Text, View } from 'react-native';

import { PlayerAvatar } from '@/components/ref/PlayerAvatar';
import { StatusTag } from '@/components/ref/primitives';
import { cream, creamFaint, gold, ink, radius, rgba, sp } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';

export function SelfStatusBar({
  name,
  seat,
  handCount,
  alive = true,
}: {
  name: string;
  seat: number;
  handCount: number;
  alive?: boolean;
}) {
  return (
    <View style={styles.bar}>
      <PlayerAvatar name={name} seat={seat} size="sm" alive={alive} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1} allowFontScaling={false}>
          我（{name}）
        </Text>
        <Text style={styles.count} allowFontScaling={false}>
          手牌 {handCount} 张
        </Text>
      </View>
      <StatusTag tone={alive ? 'gold' : 'muted'}>{alive ? '仙途' : '已淘汰'}</StatusTag>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: sp(4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.35),
    backgroundColor: rgba(ink[950], 0.7),
    paddingHorizontal: sp(3.5),
    paddingVertical: sp(2.5),
  },
  body: { flex: 1, minWidth: 0 },
  name: { ...serif(600), fontSize: 14, color: cream },
  count: { ...sans(400), fontSize: 10, letterSpacing: 0.4, color: creamFaint },
});

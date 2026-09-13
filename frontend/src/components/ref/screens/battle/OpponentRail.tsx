/**
 * 对手横滑卡 —— 参考 `BattleScreen.tsx` 第 39–53 行原样移植。
 *
 *   第 40 行 轨道：`mt-4 flex gap-2.5 overflow-x-auto scrollbar-none px-4`（RN ScrollView horizontal 默认无滚动条）
 *   第 44 行 卡片：`w-[104px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-gold-500/25
 *                 bg-ink-950/60 px-2 py-2.5`
 *   第 46-51 行 头像 sm + 名字 11px serif 500 + `StatusTag`（存活 jade / 淘汰 muted）「手牌 N 张」，tag 内 10px
 *
 * 铁律 3：只显示**张数**，绝不显示他人牌面。
 * （参考卡片的 `backdrop-blur-sm` 未移植：卡片背后是纯渐变底，/60 黑底已经是最终观感，
 *   逐卡再包一层 BlurView 在 Android 上代价明显；已有 `BottomBar` 保留了 BlurView 的用法。）
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlayerAvatar } from '@/components/ref/PlayerAvatar';
import { StatusTag } from '@/components/ref/primitives';
import { cream, gold, ink, radius, rgba, sp, track } from '@/theme/ref';
import { sans, serif } from '@/theme/refFonts';
import type { PlayerPublicView } from '@/types/game';

export function OpponentRail({ players }: { players: PlayerPublicView[] }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.rail}
      contentContainerStyle={styles.railInner}
    >
      {players.map((player) => (
        <View key={player.player_id} style={styles.card}>
          <PlayerAvatar name={player.name} seat={player.player_id} size="sm" alive={player.alive} />
          <Text style={styles.name} numberOfLines={1} allowFontScaling={false}>
            {player.name}
          </Text>
          <StatusTag
            tone={player.alive ? 'jade' : 'muted'}
            style={styles.tag}
            textStyle={styles.tagText}
          >
            手牌 {player.hand_count} 张
          </StatusTag>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { marginTop: sp(4), flexGrow: 0 },
  railInner: { gap: sp(2.5), paddingHorizontal: sp(4) },
  card: {
    width: 104,
    flexShrink: 0,
    alignItems: 'center',
    gap: sp(1.5),
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: rgba(gold[500], 0.25),
    backgroundColor: rgba(ink[950], 0.6),
    paddingHorizontal: sp(2),
    paddingVertical: sp(2.5),
  },
  name: { ...serif(500), fontSize: 11, color: cream, width: '100%', textAlign: 'center' },
  tag: { paddingHorizontal: sp(2), paddingVertical: 0 },
  tagText: { ...sans(500), fontSize: 10, letterSpacing: track(0.05, 10) },
});

import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { ResultActions, ResultBadge, ResultRanking, ResultStatBlock, rankingOf, resultStatsOf } from '@/components/result';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { useGameStore } from '@/store/game-store';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { fontFamily, text } from '@/theme/typography';

/**
 * 「天劫试炼 · 结算」（fig4_1 1:1，墨玉色板）
 *   小标题「天劫试炼」→ 主文案「渡劫成功 / 渡劫失败」→ 圆形徽记 + 胜者名 + 「最后存活 · 证道成功」
 *   → 统计三列（回合 / 出牌 / 渡劫）→ 最终名次列表 → 「再来一局」/「返回主页」。
 * 所有数值取自真实 GameView；拿不到的指标显示「—」，绝不编造胜者或数据。
 */
export default function ResultScreen() {
  const view = useGameStore((state) => state.view);
  const setup = useGameStore((state) => state.setup);
  const createGame = useGameStore((state) => state.createGame);
  const clearGame = useGameStore((state) => state.clearGame);
  const isSubmitting = useGameStore((state) => state.isSubmitting);
  const battleLog = useGameStore((state) => state.battleLog);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);

  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!view) router.replace('/');
  }, [view]);

  if (!view) {
    return (
      <ScreenBackground variant="plain" contentStyle={styles.emptyContent}>
        <Head>
          <title>对局结算 · 修仙卡牌</title>
        </Head>
        <View style={styles.emptyWrap}>
          <Text style={styles.eyebrow}>天劫试炼</Text>
          <Text style={styles.emptyTitle}>尚无结算数据</Text>
          <Text style={styles.emptyHint}>请先开始一局试炼。</Text>
          <ResultActions onRestart={() => router.replace('/setup')} onHome={() => router.replace('/')} />
        </View>
      </ScreenBackground>
    );
  }

  const winnerId = typeof view.winner === 'number' && view.winner >= 0 ? view.winner : null;
  const winner = view.public.players.find((player) => player.player_id === winnerId);
  const iWon = winnerId !== null && winnerId === view.viewer_player_id;
  const ended = view.status === 'ended' || view.phase === 'ENDED';

  const headline = winnerId === null ? '天机未定' : iWon ? '渡劫成功' : '渡劫失败';
  const winnerName = winner?.name ?? (winnerId === null ? '无人生还' : `P${winnerId}`);
  const subtitle =
    winnerId === null ? '本局平局 · 无胜者' : iWon ? '最后存活 · 证道成功' : `${winnerName} 最后存活 · 证道成功`;

  const stats = resultStatsOf({ view, log: battleLog });
  const ranking = rankingOf(view);
  const me = view.public.players.find((player) => player.player_id === view.viewer_player_id);

  const restart = async () => {
    setStarting(true);
    const gameId = await createGame(setup);
    setStarting(false);
    if (gameId) router.replace('/battle');
  };

  return (
    <ScreenBackground variant="plain" scroll contentStyle={styles.content}>
      <Head>
        <title>对局结算 · 修仙卡牌</title>
      </Head>

      <View style={styles.inner} testID="result-screen">
        {/* 小标题：设计 y 38-50，左对齐 x 28.5 */}
        <Text style={styles.eyebrow}>天劫试炼</Text>

        {/* 主文案：设计 y 69.5-119.5，居中，字号 ≈44 */}
        <Text
          style={[styles.headline, iWon ? styles.headlineWin : winnerId === null ? null : styles.headlineLose]}
          testID="result-headline"
        >
          {headline}
        </Text>

        <Banner message={error} onDismiss={clearError} />

        {!ended ? (
          <View style={styles.noticeRow}>
            <Badge label={`对局状态 ${view.status}`} tone="muted" />
            <Text style={styles.noticeText}>本局尚未结束，以下为当前实时局面。</Text>
          </View>
        ) : null}

        {/* 徽记 + 胜者名 + 副标题（设计 y 171-413） */}
        <ResultBadge name={winnerName} subtitle={subtitle} />

        {/* 统计三列（设计 y 448-563.5） */}
        <ResultStatBlock stats={stats} />

        {/* 最终排名（设计标题 y 596-610 + 行 y 628-792） */}
        <Text style={styles.sectionTitle}>最终排名</Text>
        <ResultRanking players={ranking} />

        <View style={styles.spacer} />

        <ResultActions
          onRestart={() => void restart()}
          onHome={() => {
            clearGame();
            router.replace('/');
          }}
          restarting={starting || isSubmitting}
        />

        <Text style={styles.footnote}>
          回合 / 出牌取自 GameView.public（round、discard_count）；渡劫取自本局事件流中的 TRIBULATION_*
          事件；胜负与淘汰全部由后端裁定。{me && !me.alive ? ' 你已被淘汰。' : ''}
        </Text>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  emptyContent: {
    flex: 1,
  },
  inner: {
    width: '100%',
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 38,
    paddingBottom: 4,
  },
  eyebrow: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    letterSpacing: 4,
    color: colors.goldLight,
  },
  headline: {
    fontFamily: fontFamily.title,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.text,
    marginTop: 18,
  },
  headlineWin: {
    color: colors.goldLight,
  },
  headlineLose: {
    color: colors.danger,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  noticeText: {
    ...text.caption,
    flexShrink: 1,
  },
  sectionTitle: {
    fontFamily: fontFamily.title,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.goldLight,
    marginTop: 28,
    marginBottom: 0,
  },
  spacer: {
    flexGrow: 1,
    minHeight: 8,
  },
  footnote: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    lineHeight: 15,
    color: colors.textFaint,
    marginTop: 16,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fontFamily.title,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.text,
  },
  emptyHint: {
    ...text.caption,
    textAlign: 'center',
  },
});

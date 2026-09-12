import { router } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { Panel } from '@/components/ui/Panel';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useGameStore } from '@/store/game-store';
import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { fontFamily, text } from '@/theme/typography';

export default function ResultScreen() {
  const view = useGameStore((state) => state.view);
  const setup = useGameStore((state) => state.setup);
  const createGame = useGameStore((state) => state.createGame);
  const clearGame = useGameStore((state) => state.clearGame);
  const isSubmitting = useGameStore((state) => state.isSubmitting);
  const error = useGameStore((state) => state.error);
  const clearError = useGameStore((state) => state.clearError);

  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!view) router.replace('/');
  }, [view]);

  if (!view) {
    return (
      <ScreenBackground variant="home" contentStyle={styles.content}>
        <Head>
          <title>对局结算 · 修仙卡牌</title>
        </Head>
        <View style={styles.emptyWrap}>
          <Text style={styles.eyebrow}>尚无结算数据</Text>
          <Text style={styles.subline}>请先开始一局试炼。</Text>
          <View style={styles.actions}>
            <PrimaryButton label="返回首页" variant="gold" onPress={() => router.replace('/')} />
          </View>
        </View>
      </ScreenBackground>
    );
  }

  const viewerId = view.viewer_player_id;
  const players = view.public.players;
  const winnerId = typeof view.winner === 'number' ? view.winner : null;
  const winner = players.find((player) => player.player_id === winnerId);
  const me = players.find((player) => player.player_id === viewerId);
  const iWon = winnerId === viewerId;
  const draw = winnerId === null || winnerId === undefined || winnerId < 0;

  const headline = draw ? '天机未定' : iWon ? '证得长生' : '道消身殒';
  const subline = draw
    ? '本局以平局收场（forced stop 或同时陨落）'
    : iWon
      ? '你在天劫试炼中活到了最后'
      : `${winner?.name ?? `P${winnerId}`} 活到了最后`;

  const restart = async () => {
    setStarting(true);
    const gameId = await createGame(setup);
    setStarting(false);
    if (gameId) router.replace('/battle');
  };

  return (
    <ScreenBackground variant="home" contentStyle={styles.content}>
      <Head>
        <title>对局结算 · 修仙卡牌</title>
      </Head>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>天劫试炼 · 终局</Text>
        <Text style={[styles.headline, iWon ? styles.win : draw ? null : styles.lose]}>
          {headline}
        </Text>
        <Text style={styles.subline}>{subline}</Text>

        <Banner message={error} onDismiss={clearError} />

        <View style={styles.badgeRow}>
          <Badge label={`revision ${view.revision}`} tone="muted" />
          <Badge label={`状态 ${view.status}`} tone="neutral" />
          {view.forced_stop ? <Badge label="forced stop" tone="danger" /> : null}
          <Badge label={`第 ${view.public.round} 回合`} tone="jade" />
        </View>

        <Panel title="玩家结果" style={styles.panel}>
          {players.map((player) => {
            const isWinner = player.player_id === winnerId;
            return (
              <View
                key={player.player_id}
                style={[styles.row, isWinner ? styles.rowWin : null]}
              >
                <Text style={styles.rowName}>
                  {player.name}
                  {player.player_id === viewerId ? '（你）' : ''}
                </Text>
                <View style={styles.rowRight}>
                  <Badge
                    label={player.alive ? '存活' : '已淘汰'}
                    tone={player.alive ? 'jade' : 'danger'}
                  />
                  {isWinner ? <Badge label="胜者" tone="gold" /> : null}
                </View>
              </View>
            );
          })}
        </Panel>

        <Panel title="本局设置" style={styles.panel}>
          <Text style={styles.settingLine}>人数：{setup.players}</Text>
          <Text style={styles.settingLine}>
            座位 AI：{setup.agentTypes.slice(0, setup.players).join(' / ')}
          </Text>
          <Text style={styles.settingLine}>
            ISMCTS simulations：{setup.ismctsSimulations}
          </Text>
          <Text style={styles.settingLine}>Seed：{setup.seed.trim() || '服务端随机'}</Text>
        </Panel>

        {me && !me.alive ? (
          <Text style={styles.footnote}>
            你已被淘汰：抽到【天劫】且手中没有【护劫符】（规则由后端裁决）。
          </Text>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton
            label="再来一局"
            variant="gold"
            glyph="炼"
            loading={starting || isSubmitting}
            disabled={starting || isSubmitting}
            onPress={() => void restart()}
            testID="result-restart"
          />
          <View style={styles.actionRow}>
            <View style={styles.actionItem}>
              <PrimaryButton
                label="重新设置"
                variant="jade"
                onPress={() => {
                  clearGame();
                  router.replace('/setup');
                }}
              />
            </View>
            <View style={styles.actionItem}>
              <PrimaryButton label="卡牌图鉴" variant="ghost" onPress={() => router.push('/cards')} />
            </View>
          </View>
          <PrimaryButton
            label="返回首页"
            variant="ghost"
            onPress={() => {
              clearGame();
              router.replace('/');
            }}
          />
        </View>

        <Text style={styles.footer}>胜负、淘汰与结束全部由后端权威裁定，前端仅展示。</Text>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    alignItems: 'center',
    width: '100%',
  },
  eyebrow: {
    ...text.label,
    color: colors.goldLight,
    letterSpacing: 4,
  },
  headline: {
    fontFamily: fontFamily.title,
    fontSize: 44,
    fontWeight: '700',
    color: colors.paper,
    letterSpacing: 8,
    marginTop: spacing.sm,
  },
  win: {
    color: colors.goldLight,
  },
  lose: {
    color: colors.danger,
  },
  subline: {
    ...text.caption,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  panel: {
    width: '100%',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  rowWin: {
    borderColor: colors.goldLight,
    backgroundColor: 'rgba(201,166,90,0.16)',
  },
  rowName: {
    ...text.bodyStrong,
  },
  rowRight: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  settingLine: {
    ...text.label,
    fontSize: 11,
    marginBottom: 2,
  },
  footnote: {
    ...text.label,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionItem: {
    flex: 1,
  },
  footer: {
    ...text.label,
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});

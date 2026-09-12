import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiModeLabel, isMockMode } from '@/api/client';
import { getGame } from '@/api/game';
import { mockApi } from '@/api/mock';
import { ActionBar } from '@/components/action-bar/ActionBar';
import { BattleHeader, BattleLog, PhaseIndicator } from '@/components/battle';
import { DeckPile, DiscardPile } from '@/components/deck-pile';
import { SpecialDecisionLayer } from '@/components/dialogs';
import { EventAnimator } from '@/components/event-animator/EventAnimator';
import { CardDetailSheet, GameCard } from '@/components/game-card';
import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { PlayerPanel } from '@/components/player-panel/PlayerPanel';
import { Badge } from '@/components/ui/Badge';
import { Banner } from '@/components/ui/Banner';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Panel } from '@/components/ui/Panel';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useResponsive } from '@/hooks/use-responsive';
import { useGameStore } from '@/store/game-store';
import { colors } from '@/theme/colors';
import { borderWidth, radius, spacing } from '@/theme/spacing';
import { text } from '@/theme/typography';
import { cardSpecOf } from '@/utils/card-catalog';
import {
  cardVisualState,
  directActionForCard,
  isHumanDeciding,
  nonCardActions,
  playerNameOf,
  targetActionsForCard,
} from '@/utils/legal-actions';

export default function BattleScreen() {
  const params = useLocalSearchParams<{ gameId?: string }>();
  const view = useGameStore((state) => state.view);
  const gameId = useGameStore((state) => state.gameId);
  const isSubmitting = useGameStore((state) => state.isSubmitting);
  const isRefreshing = useGameStore((state) => state.isRefreshing);
  const animationQueue = useGameStore((state) => state.animationQueue);
  const selectedCardId = useGameStore((state) => state.selectedCardId);
  const battleLog = useGameStore((state) => state.battleLog);
  const error = useGameStore((state) => state.error);
  const notice = useGameStore((state) => state.notice);
  const clearError = useGameStore((state) => state.clearError);
  const refreshGame = useGameStore((state) => state.refreshGame);
  const selectCard = useGameStore((state) => state.selectCard);
  const submitAction = useGameStore((state) => state.submitAction);
  const clearGame = useGameStore((state) => state.clearGame);

  const layout = useResponsive();
  const [recovering, setRecovering] = useState(false);

  const locked = isSubmitting || animationQueue.length > 0;
  const isMyTurn = isHumanDeciding(view);

  // reload / 深链恢复：GET /games/{id}（API_CONTRACT §15）
  useEffect(() => {
    const fromUrl = params.gameId;
    if (!fromUrl || fromUrl === useGameStore.getState().gameId) return;
    let mounted = true;
    setRecovering(true);
    getGame(fromUrl)
      .then((recovered) => {
        if (!mounted) return;
        useGameStore.setState({
          gameId: recovered.game_id,
          view: recovered,
          animationQueue: [],
          isSubmitting: false,
          error: undefined,
        });
      })
      .catch(() => {
        if (mounted) router.replace('/');
      })
      .finally(() => {
        if (mounted) setRecovering(false);
      });
    return () => {
      mounted = false;
    };
  }, [params.gameId]);

  // 没有对局 → 回首页
  useEffect(() => {
    if (!gameId && !view && !params.gameId) {
      router.replace('/');
    }
  }, [gameId, view, params.gameId]);

  // 终局 → 结果页（等动画播完再跳）
  useEffect(() => {
    if (!view) return;
    const ended = view.status === 'ended' || view.phase === 'ENDED';
    if (ended && animationQueue.length === 0 && !isSubmitting) {
      router.replace('/result');
    }
  }, [view, animationQueue.length, isSubmitting]);

  const opponents = useMemo(
    () => (view?.public.players ?? []).filter((player) => player.player_id !== view?.viewer_player_id),
    [view],
  );

  const selectedInstance = useMemo(
    () =>
      view && selectedCardId
        ? view.observation.hand.find((card) => card.instance_id === selectedCardId)
        : undefined,
    [view, selectedCardId],
  );

  const selectedTargetActions = useMemo(
    () =>
      view && selectedInstance
        ? targetActionsForCard(view, selectedInstance.instance_id)
        : [],
    [view, selectedInstance],
  );

  if (!view) {
    return (
      <ScreenBackground variant="battle">
        <Head>
          <title>对局中 · 修仙卡牌</title>
        </Head>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>尚未开局</Text>
          <View style={styles.emptyButton}>
            <PrimaryButton label="返回首页" variant="ghost" onPress={() => router.replace('/')} />
          </View>
        </View>
        <LoadingOverlay visible label="正在读取对局…" />
      </ScreenBackground>
    );
  }

  const directAction = selectedInstance
    ? directActionForCard(view, selectedInstance.instance_id)
    : undefined;
  const selectedSpec = selectedInstance ? cardSpecOf(selectedInstance.card_id) : undefined;

  const handleCardPress = (instanceId: string) => {
    if (locked) return;
    selectCard(instanceId);
  };

  const handleAction = (actionId: string) => {
    if (locked) return;
    void submitAction(actionId, {});
  };

  return (
    <ScreenBackground variant="battle" decorative={false}>
      <Head>
        <title>对局中 · 修仙卡牌</title>
      </Head>
      <View style={styles.root}>
        <BattleHeader
          round={view.public.round}
          turnNo={view.public.turn_no}
          phase={view.phase}
          revision={view.revision}
          status={view.status}
          modeLabel={apiModeLabel()}
          refreshing={isRefreshing}
          onRefresh={() => void refreshGame()}
          onLeave={() => router.replace('/')}
        />

        <Banner message={error} onDismiss={clearError} actionLabel="重新同步" onAction={() => void refreshGame()} />
        <Banner tone="notice" message={notice} onDismiss={clearError} />

        {locked ? (
          <View style={styles.lockRow}>
            <Badge
              label={animationQueue.length > 0 ? `动画播放中（剩余 ${animationQueue.length}）` : '正在提交，输入已锁定'}
              tone="gold"
            />
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 对手 */}
          <Panel title="对手" tone="surface" style={styles.block}>
            {opponents.length === 0 ? (
              <Text style={styles.hint}>当前没有对手（单人局）。</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {opponents.map((player) => (
                  <PlayerPanel key={player.player_id} player={player} compact />
                ))}
              </ScrollView>
            )}
          </Panel>

          {/* 战场 */}
          <View style={styles.arena}>
            <DeckPile
              count={view.public.deck_count}
              knownTop={view.observation.known_top}
              highlighted={view.phase === 'REORDER' || view.phase === 'REINSERT'}
            />
            <PhaseIndicator
              phase={view.phase}
              isViewerDecision={isMyTurn}
              decisionPlayerName={playerNameOf(view, view.decision_player)}
              actionsUsed={view.observation.actions_used}
              maxActions={view.observation.max_actions_per_turn}
              size={layout.isCompact ? 112 : 132}
            />
            <DiscardPile count={view.public.discard_count} lastCardId={view.public.last_discard} />
          </View>

          {/* 手牌 */}
          <Panel title={`你的手牌（${view.observation.hand.length}）`} tone="jade" style={styles.block}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hand}>
              {view.observation.hand.length === 0 ? (
                <Text style={styles.hint}>手牌已空。</Text>
              ) : (
                view.observation.hand.map((card) => {
                  const state = cardVisualState(view, card.instance_id, selectedCardId === card.instance_id);
                  const hasTargets = targetActionsForCard(view, card.instance_id).length > 0;
                  return (
                    <GameCard
                      key={card.instance_id}
                      testID={`hand-${card.instance_id}`}
                      cardId={card.card_id}
                      name={card.name}
                      state={state}
                      pressableWhenDisabled
                      width={layout.handCardWidth}
                      height={layout.handCardHeight}
                      footnote={hasTargets ? '需选目标' : undefined}
                      onPress={() => handleCardPress(card.instance_id)}
                      style={styles.handCard}
                    />
                  );
                })
              )}
            </ScrollView>
            <Text style={styles.hint}>
              可出与否完全由后端 legal_actions 决定；点牌查看详情或选择目标。
            </Text>
          </Panel>

          {/* 动作条 */}
          <Panel title="可用动作（来自 legal_actions）" tone="gold" style={styles.block}>
            <ActionBar
              actions={nonCardActions(view)}
              onPress={(action) => handleAction(action.id)}
              disabled={locked || !isMyTurn}
              submitting={locked}
              emptyHint={
                isMyTurn
                  ? '当前阶段只给出与手牌绑定的动作，请点击手牌'
                  : `等待 ${playerNameOf(view, view.decision_player)} 决策…`
              }
            />
          </Panel>

          {/* 四种特殊决策弹窗 + 未完成决策入口 */}
          <SpecialDecisionLayer />

          {/* 战斗日志 */}
          <View style={styles.block}>
            <BattleLog lines={battleLog} />
          </View>

          {/* 工具区 */}
          <Panel title="调试 / 恢复" style={styles.block}>
            <View style={styles.toolRow}>
              <View style={styles.toolItem}>
                <PrimaryButton
                  label={isRefreshing ? '同步中…' : 'GET /games 刷新'}
                  variant="ghost"
                  loading={isRefreshing}
                  onPress={() => void refreshGame()}
                />
              </View>
              <View style={styles.toolItem}>
                <PrimaryButton
                  label="放弃对局"
                  variant="ghost"
                  onPress={() => {
                    clearGame();
                    router.replace('/');
                  }}
                />
              </View>
            </View>

            {isMockMode() ? (
              <PrimaryButton
                label="模拟 409 revision 冲突"
                variant="ghost"
                hint="mock 专用：把 revision 推一格，下一次提交触发 409 → 自动拉取最新局面并提示"
                onPress={() => {
                  const revision = mockApi.simulateStaleRevision();
                  useGameStore.setState({
                    notice:
                      revision === null
                        ? '当前没有 mock 对局。'
                        : `mock revision 已推进到 ${revision}，下一次提交将触发 409 恢复流程。`,
                  });
                }}
              />
            ) : null}
          </Panel>
        </ScrollView>

        <LoadingOverlay
          visible={(isSubmitting || recovering) && animationQueue.length === 0}
          label={recovering ? '正在恢复对局…' : '正在提交动作，等待后端推演 AI…'}
        />
        {/* 卡牌详情：只在「无目标选择需求」时打开，避免与 TargetPlayerDialog 抢焦点 */}
        <CardDetailSheet
          visible={Boolean(selectedInstance) && selectedTargetActions.length === 0 && !locked}
          cardId={selectedInstance?.card_id}
          name={selectedInstance?.name}
          category={selectedSpec?.category}
          description={selectedSpec?.description}
          actionLabel={directAction?.label}
          actionHint={
            directAction
              ? `将提交后端动作 ${directAction.id}（revision ${view.revision}）`
              : undefined
          }
          onConfirm={() => {
            if (directAction) void submitAction(directAction.id, {});
            selectCard(undefined);
          }}
          onClose={() => selectCard(undefined)}
          cardWidth={layout.detailCardWidth}
        />
        <EventAnimator />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  scroll: {
    paddingBottom: spacing.xl,
  },
  block: {
    marginBottom: spacing.md,
  },
  lockRow: {
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  arena: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  hand: {
    marginBottom: spacing.sm,
  },
  handCard: {
    marginRight: spacing.sm,
  },
  hint: {
    ...text.label,
    fontSize: 10,
  },
  toolRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  toolItem: {
    flex: 1,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...text.title,
    fontSize: 20,
    marginBottom: spacing.md,
  },
  emptyButton: {
    minWidth: 160,
  },
  code: {
    ...text.label,
    fontSize: 10,
    color: colors.jadeLight,
  },
  card: {
    borderWidth: borderWidth.hair,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});

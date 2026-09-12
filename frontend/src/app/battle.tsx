/**
 * 对局页（设计原图 `images/figma/fig3_1.png`，夜蓝青瓷色板）。
 *
 * 版面骨架（1x = 430×932，数值来自 `docs/design_measurements.md` 的实测）：
 *   顶部鎏金线 y52 / y81 → 轮次栏 → 对手区 y93-234 → 阶段提示带 y234-315
 *   → 行动条 y381-395 → 中央法阵 y395-508 → 左牌堆 / 右弃牌堆 y526-537
 *   → 战斗日志（设计图这里是留白，用于承载事件回看）→ 我的信息条
 *   → 手牌 y709-817（70×108 × N，间距 8）→ 底部鎏金线 y830 → 「认输 / 结束回合」y830-872
 *
 * 行为铁律（改视觉不得破坏）：
 *   1. 所有可点牌 / 按钮都由后端 `legal_actions` 驱动（含 `enabled`），前端不判断规则；
 *   2. 提交带 `revision`，提交中锁定输入；事件队列按 `seq` 播完才解锁；409 冲突自动恢复；
 *   3. 四个特殊决策（反制 / 摄物术选目标 / 逆天改命排序 / 天劫回插）是独立弹窗组件；
 *   4. 他人手牌内容、牌堆内容绝不显示；牌堆 / 弃牌堆数字一律用后端真实值；
 *   5. 卡面不显示费用数字（规则无费用），改为类型符点，行动用量由 HUD 的「行动 已用/上限」表达。
 */
import { router, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { apiModeLabel, isMockMode } from '@/api/client';
import { getGame } from '@/api/game';
import { mockApi } from '@/api/mock';
import { ActionBar } from '@/components/action-bar/ActionBar';
import {
  ActionMeter,
  BattleHeader,
  BattleLog,
  BattleNotice,
  PhaseBanner,
  PhaseIndicator,
  SelfStrip,
  useBattleLayout,
} from '@/components/battle';
import { DeckPile, DiscardPile } from '@/components/deck-pile';
import { SpecialDecisionLayer } from '@/components/dialogs';
import { EventAnimator } from '@/components/event-animator/EventAnimator';
import { CardDetailSheet, GameCard } from '@/components/game-card';
import { ScreenBackground } from '@/components/layout/ScreenBackground';
import { PlayerPanel } from '@/components/player-panel/PlayerPanel';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { NightButton } from '@/components/ui/NightButton';
import { useGameStore } from '@/store/game-store';
import { nightColors } from '@/theme/colors';
import { borderWidth, radius } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';
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
  const lastActionId = useGameStore((state) => state.lastActionId);
  const clearError = useGameStore((state) => state.clearError);
  const refreshGame = useGameStore((state) => state.refreshGame);
  const selectCard = useGameStore((state) => state.selectCard);
  const submitAction = useGameStore((state) => state.submitAction);
  const clearGame = useGameStore((state) => state.clearGame);

  const layout = useBattleLayout(view?.observation.hand.length ?? 5);
  const [recovering, setRecovering] = useState(false);
  const [surrenderOpen, setSurrenderOpen] = useState(false);
  /** 中区内容实际高度：让「底部按钮」正好贴在骨架下面（设计图 y830），而不是被推到屏幕底端 */
  const [contentHeight, setContentHeight] = useState(0);

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

  const me = useMemo(
    () => view?.public.players.find((player) => player.player_id === view?.viewer_player_id),
    [view],
  );

  const aliveSeats = view?.public.players.filter((player) => player.alive).length ?? 0;

  const selectedInstance = useMemo(
    () =>
      view && selectedCardId
        ? view.observation.hand.find((card) => card.instance_id === selectedCardId)
        : undefined,
    [view, selectedCardId],
  );

  const selectedTargetActions = useMemo(
    () => (view && selectedInstance ? targetActionsForCard(view, selectedInstance.instance_id) : []),
    [view, selectedInstance],
  );

  // 中区留白 ↔ 日志高度。
  // 设计锚点（1x）：轮次栏 y52-81、对手区 y93-234、阶段带 y234-315、行动条 y381-395、
  // 法阵 y395-508、牌堆标签 y526-537、手牌 y709-817、按钮 y830-872。
  // 设计图在「牌堆标签 → 手牌」之间是留白（约 170px）：这里用「固定高度的日志 + 弹性留白」填，
  // 好处是手牌上方的高度与手牌张数无关 —— 1 张和 8 张牌的手牌区顶部位置一致。
  const logHeight = Math.round(70 * layout.s);

  if (!view) {
    return (
      <ScreenBackground variant="battle" tone="night">
        <Head>
          <title>对局中 · 修仙卡牌</title>
        </Head>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText} allowFontScaling={false}>
            尚未开局
          </Text>
          <NightButton
            label="返回首页"
            variant="ghost"
            onPress={() => router.replace('/')}
            style={styles.emptyButton}
          />
        </View>
        <LoadingOverlay visible label="正在读取对局…" />
      </ScreenBackground>
    );
  }

  const directAction = selectedInstance
    ? directActionForCard(view, selectedInstance.instance_id)
    : undefined;
  const selectedSpec = selectedInstance ? cardSpecOf(selectedInstance.card_id) : undefined;

  const nonEndActions = nonCardActions(view).filter((action) => action.type !== 'END_ACTION');
  const endAction = nonCardActions(view).find((action) => action.type === 'END_ACTION');

  const handleCardPress = (instanceId: string) => {
    if (locked) return;
    selectCard(instanceId);
  };

  const handleAction = (actionId: string) => {
    if (locked) return;
    void submitAction(actionId, {});
  };

  return (
    <ScreenBackground variant="battle" tone="night" decorative={false}>
      <Head>
        <title>对局中 · 修仙卡牌</title>
      </Head>

      <View style={[styles.root, { paddingHorizontal: layout.padH, paddingTop: 12 * layout.s }]}>
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
          s={layout.s}
        />

        <BattleNotice
          message={error}
          tone="error"
          onDismiss={clearError}
          actionLabel="重新同步"
          onAction={() => void refreshGame()}
        />
        <BattleNotice message={notice} tone="notice" onDismiss={clearError} />

        <ScrollView
          style={[
            styles.scroll,
            contentHeight > 0 ? { maxHeight: contentHeight, flexGrow: 0, flexBasis: 'auto' } : null,
          ]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(_, h) => setContentHeight(h)}
        >
          {/* 对手区（y93-234）：每个对手一张 101×141 的公开信息卡 */}
          <View style={[styles.oppRow, { marginTop: 40 * layout.s }]}>
            {opponents.length === 0 ? (
              <Text style={styles.hint} allowFontScaling={false}>
                当前没有对手（单人局）。
              </Text>
            ) : (
              opponents.map((player) => (
                <PlayerPanel
                  key={player.player_id}
                  player={player}
                  width={layout.opponentW}
                  height={layout.opponentH}
                />
              ))
            )}
          </View>

          {/* 阶段提示带（y234-315） */}
          <View style={{ marginTop: 2 * layout.s }}>
            <PhaseBanner phase={view.phase} s={layout.s} />
          </View>

          {/* 法阵区（y381-508）：左牌堆 / 中央法阵 / 右弃牌堆 */}
          <View style={[styles.arenaRow, { marginTop: 68 * layout.s }]}>
            <View style={{ marginBottom: 16 * layout.s }}>
              <DeckPile
                count={view.public.deck_count}
                knownTop={view.observation.known_top}
                highlighted={view.phase === 'REORDER' || view.phase === 'REINSERT'}
                width={layout.pileW}
              />
            </View>
            <View style={styles.arenaCenter}>
              <ActionMeter
                used={view.observation.actions_used}
                max={view.observation.max_actions_per_turn}
                s={layout.s}
                active={isMyTurn}
              />
              <View style={{ height: 10 * layout.s }} />
              <PhaseIndicator
                phase={view.phase}
                isViewerDecision={isMyTurn}
                decisionPlayerName={playerNameOf(view, view.decision_player)}
                size={layout.arenaSize}
                hint={
                  isMyTurn
                    ? '轮到你决策 · 点牌查看或出牌'
                    : `${playerNameOf(view, view.decision_player)} 正在决策`
                }
              />
            </View>
            <View style={{ marginBottom: 16 * layout.s }}>
              <DiscardPile
                count={view.public.discard_count}
                lastCardId={view.public.last_discard}
                width={layout.pileW}
              />
            </View>
          </View>

          {/* 冻结提示：提交中 / 动画播放中，输入锁定 */}
          {locked ? (
            <Text style={styles.lockText} allowFontScaling={false}>
              {animationQueue.length > 0
                ? `事件播放中（剩余 ${animationQueue.length}）· 输入已锁定`
                : '正在提交动作 · 输入已锁定'}
            </Text>
          ) : null}

          {/* 不绑定手牌的动作（END_ACTION 由底部主按钮承担）*/}
          <View style={[styles.block, { marginTop: 10 * layout.s }]}>
            <ActionBar
              actions={nonEndActions}
              onPress={(action) => handleAction(action.id)}
              disabled={locked || !isMyTurn}
              submitting={locked}
              highlightId={lastActionId}
              compact={layout.isCompact}
              emptyHint={
                isMyTurn
                  ? '当前动作都在手牌上：点牌查看详情或选择目标'
                  : `等待 ${playerNameOf(view, view.decision_player)} 决策…`
              }
            />
          </View>

          {/* 四个特殊决策弹窗 + 未完成决策入口 */}
          <SpecialDecisionLayer />

          {/* 战斗日志（设计图此处留白，用于回看事件事实） */}
          <View style={styles.logWrap}>
            <BattleLog lines={battleLog} height={logHeight} />
          </View>

          {/* 我的信息条 + 手牌区（y709-817） */}
          <SelfStrip
            name={me?.name ?? `P${view.viewer_player_id}`}
            handCount={view.observation.hand.length}
            alive={me?.alive ?? true}
            isMyTurn={isMyTurn}
            alive_seat_count={aliveSeats}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.hand, { gap: layout.handGap }]}
            style={{ marginTop: 8 * layout.s, maxHeight: layout.handCardH + 12 }}
          >
            {view.observation.hand.length === 0 ? (
              <Text style={styles.hint} allowFontScaling={false}>
                手牌已空。
              </Text>
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
                    width={layout.handCardW}
                    height={layout.handCardH}
                    footnote={hasTargets ? '需选目标' : undefined}
                    onPress={() => handleCardPress(card.instance_id)}
                  />
                );
              })
            )}
          </ScrollView>

          {isMockMode() ? (
            <Text
              style={styles.mockTool}
              accessibilityRole="button"
              onPress={() => {
                const revision = mockApi.simulateStaleRevision();
                useGameStore.setState({
                  notice:
                    revision === null
                      ? '当前没有 mock 对局。'
                      : `mock revision 已推进到 ${revision}，下一次提交将触发 409 恢复流程。`,
                });
              }}
              allowFontScaling={false}
            >
              mock：模拟一次 409 revision 冲突
            </Text>
          ) : null}
        </ScrollView>

        {/* 底部鎏金线 + 主 / 次按钮（y830-872） */}
        <View style={styles.bottomRule} />
        <View style={styles.bottomBar}>
          <NightButton
            label="认输"
            variant="ghost"
            testID="surrender"
            height={layout.buttonH}
            disabled={locked}
            onPress={() => setSurrenderOpen(true)}
            hint="结束本局并返回首页"
            style={styles.bottomItem}
          />
          <NightButton
            label={endAction?.label ?? '结束回合'}
            variant="gold"
            glyph="行"
            testID="end-turn"
            height={layout.buttonH}
            disabled={locked || !isMyTurn || !endAction}
            loading={locked}
            onPress={() => {
              if (endAction) handleAction(endAction.id);
            }}
            hint={endAction ? undefined : '当前阶段后端未给出结束动作'}
            style={styles.bottomItem}
          />
        </View>
      </View>

      {/* 认输 = DELETE /games/{id} + 回首页（契约无 surrender，DESIGN_SPEC §4） */}
      <Modal
        visible={surrenderOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSurrenderOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle} allowFontScaling={false}>
              认输
            </Text>
            <Text style={styles.modalBody} allowFontScaling={false}>
              认输会销毁当前对局（DELETE /api/v1/games/{view.game_id}）并返回首页，无法撤销。
            </Text>
            <View style={styles.modalRow}>
              <NightButton
                label="继续对局"
                variant="ghost"
                onPress={() => setSurrenderOpen(false)}
                style={styles.bottomItem}
              />
              <NightButton
                label="确认认输"
                variant="danger"
                glyph="认"
                testID="surrender-confirm"
                onPress={() => {
                  setSurrenderOpen(false);
                  clearGame();
                  router.replace('/');
                }}
                style={styles.bottomItem}
              />
            </View>
          </View>
        </View>
      </Modal>

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
          directAction ? `将提交后端动作 ${directAction.id}（revision ${view.revision}）` : undefined
        }
        onConfirm={() => {
          if (directAction) void submitAction(directAction.id, {});
          selectCard(undefined);
        }}
        onClose={() => selectCard(undefined)}
        cardWidth={layout.detailCardW}
      />
      <EventAnimator />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 6,
  },
  oppRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  arenaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  arenaCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  block: {
    marginTop: 10,
  },
  logWrap: {
    marginTop: 8,
    marginBottom: 6,
  },
  lockText: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.cardEdge,
    textAlign: 'center',
    marginTop: 6,
  },
  hand: {
    alignItems: 'center',
  },
  bottomRule: {
    height: 1,
    backgroundColor: 'rgba(201, 166, 90, 0.5)',
    marginTop: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  bottomItem: {
    flex: 1,
  },
  hint: {
    fontFamily: fontFamily.body,
    fontSize: 10,
    color: nightColors.muted,
    paddingVertical: 8,
  },
  mockTool: {
    fontFamily: fontFamily.body,
    fontSize: 9,
    color: nightColors.muted,
    textAlign: 'center',
    marginTop: 6,
    textDecorationLine: 'underline',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: fontFamily.title,
    fontSize: 20,
    fontWeight: '700',
    color: nightColors.celadonLight,
    marginBottom: 16,
  },
  emptyButton: {
    minWidth: 160,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: nightColors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    borderWidth: borderWidth.hair,
    borderColor: nightColors.dangerSoft,
    backgroundColor: 'rgba(15, 29, 39, 0.97)',
    padding: 14,
  },
  modalTitle: {
    fontFamily: fontFamily.title,
    fontSize: 17,
    fontWeight: '700',
    color: nightColors.celadonLight,
    letterSpacing: 2,
    marginBottom: 6,
  },
  modalBody: {
    fontFamily: fontFamily.body,
    fontSize: 11,
    lineHeight: 17,
    color: nightColors.text,
    marginBottom: 12,
  },
  modalRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
